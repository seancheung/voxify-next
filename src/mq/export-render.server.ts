import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Readable } from "node:stream";
import { aliasedTable, and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { chapters, files, projectExports, projects, segments, ttsGenerations } from "@/db/schema";
import { t } from "@/i18n";
import { finalizeUpload } from "@/lib/files.server";
import { buildObjectKey, deleteObject, storageFile, uploadStream } from "@/lib/storage.server";
import type { ExportFormat, ExportSettingsSnapshot, SubtitleFormat } from "@/types/export";
import type { ExportJobData } from "./export-project.server";

const FFMPEG_BIN = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE_BIN = process.env.FFPROBE_PATH ?? "ffprobe";

class CancelledError extends Error {
  constructor() {
    super(t("Canceled"));
    this.name = "ExportCancelledError";
  }
}

type SegmentForRender = {
  id: number;
  sortOrder: number;
  content: string | null;
  generationPath: string;
  generationDuration: number;
  leadingSilenceOverride: number | null;
  trailingSilenceOverride: number | null;
};

type ChapterForRender = {
  id: number;
  name: string;
  sortOrder: number;
  segments: SegmentForRender[];
};

type SubtitleEntry = {
  startMs: number;
  endMs: number;
  text: string;
};

type ChapterRender = {
  chapter: ChapterForRender;
  /** Local intermediate WAV — kept on disk to keep ffmpeg passes simple. */
  audioPath: string;
  durationMs: number;
  subtitles: SubtitleEntry[];
};

export async function renderExport(
  data: ExportJobData,
  signal: AbortSignal,
): Promise<{
  fileId: number;
  fileName: string;
  fileMime: string;
  fileSize: number;
  settings: ExportSettingsSnapshot;
}> {
  const checkAborted = () => {
    if (signal.aborted) throw new CancelledError();
  };

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, data.projectId), isNull(projects.deletedAt)));
  if (!project) throw new Error(t("Project not found"));

  const allChapters = await db
    .select()
    .from(chapters)
    .where(and(eq(chapters.projectId, data.projectId), isNull(chapters.deletedAt)))
    .orderBy(asc(chapters.sortOrder), asc(chapters.id));

  const targetChapters =
    data.scope === "chapter" && data.chapterId != null
      ? allChapters.filter((c) => c.id === data.chapterId)
      : allChapters;
  if (targetChapters.length === 0) throw new Error(t("No chapters to export"));

  const tmpRoot = await mkdtemp(join(tmpdir(), "voxify-export-"));
  const chaptersDir = join(tmpRoot, "chapters");
  await mkdir(chaptersDir, { recursive: true });

  let pendingFile: string | undefined;
  try {
    const chapterRenders: ChapterRender[] = [];
    for (const chapter of targetChapters) {
      checkAborted();
      const rendered = await prepareChapter(chapter);
      if (!rendered) continue;
      const audioPath = join(chaptersDir, `chapter-${chapter.id}.wav`);
      await renderChapterSimple(rendered, audioPath, signal, data.segmentGapMs);
      const durationMs = await probeWavDurationMs(audioPath);
      const subs = buildChapterSubtitles(rendered, data);
      chapterRenders.push({
        chapter: rendered,
        audioPath,
        durationMs,
        subtitles: subs,
      });
    }
    if (chapterRenders.length === 0) throw new Error(t("No segments to export"));

    const ext = formatToExt(data.format);
    const baseName = sanitizeFileName(project.name) || "export";

    const wantSplit = data.scope === "all-split";
    const wantMerged = data.scope === "all-merged" || data.scope === "chapter";

    const settingsSnapshot: ExportSettingsSnapshot = {
      scope: data.scope,
      format: data.format,
      bitrate: data.bitrate,
      sampleRate: data.sampleRate,
      mono: data.mono,
      normalizeLufs: data.normalizeLufs as ExportSettingsSnapshot["normalizeLufs"],
      subtitles: data.subtitles,
      segmentGapMs: data.segmentGapMs,
      chapterGapMs: data.chapterGapMs,
      chapterId: data.scope === "chapter" && data.chapterId != null ? data.chapterId : undefined,
      chapterName:
        data.scope === "chapter" && chapterRenders[0] ? chapterRenders[0].chapter.name : undefined,
    };

    let uploadName: string;
    let uploadMime: string;

    type AudioSource = {
      name: string;
      run: () => { stream: Readable; done: Promise<void>; kill: () => void };
    };
    const audioSources: AudioSource[] = [];
    const subtitleEntries: { name: string; content: string }[] = [];

    if (wantMerged) {
      checkAborted();
      const mergedWav = join(tmpRoot, "merged.wav");
      await concatChapterWavs(
        chapterRenders.map((r) => r.audioPath),
        data.chapterGapMs,
        mergedWav,
        signal,
      );
      const audioName =
        data.scope === "chapter"
          ? `${baseName}-${sanitizeFileName(chapterRenders[0].chapter.name)}.${ext}`
          : `${baseName}.${ext}`;

      // m4b chapter markers via small metadata file (kept on disk; far
      // simpler than piping ffmetadata over an extra stdin descriptor).
      // tmpRoot gets recursively wiped at the end so no extra cleanup needed.
      let metadataPath: string | null = null;
      if (data.format === "m4b") {
        metadataPath = join(tmpRoot, "metadata.txt");
        await writeChapterMetadata(
          metadataPath,
          buildChapterMarkers(chapterRenders, data.chapterGapMs),
        );
      }

      audioSources.push({
        name: audioName,
        run: () =>
          spawnTranscode({
            inputPath: mergedWav,
            metadataPath,
            format: data.format,
            bitrate: data.bitrate,
            sampleRate: data.sampleRate,
            mono: data.mono,
            normalizeLufs: data.normalizeLufs,
            tmpDir: tmpRoot,
            signal,
          }),
      });

      // Merged subtitle
      const mergedSubs: SubtitleEntry[] = [];
      let cursor = 0;
      for (let i = 0; i < chapterRenders.length; i++) {
        const r = chapterRenders[i];
        for (const s of r.subtitles) {
          mergedSubs.push({
            startMs: cursor + s.startMs,
            endMs: cursor + s.endMs,
            text: s.text,
          });
        }
        cursor += r.durationMs;
        if (i < chapterRenders.length - 1) cursor += data.chapterGapMs;
      }
      for (const fmt of data.subtitles) {
        subtitleEntries.push({
          name: `${baseName}.${fmt}`,
          content: serializeSubtitles(mergedSubs, fmt),
        });
      }
    } else if (wantSplit) {
      for (const r of chapterRenders) {
        const audioName = `${baseName}-${sanitizeFileName(r.chapter.name)}.${ext}`;
        audioSources.push({
          name: audioName,
          run: () =>
            spawnTranscode({
              inputPath: r.audioPath,
              metadataPath: null,
              format: data.format,
              bitrate: data.bitrate,
              sampleRate: data.sampleRate,
              mono: data.mono,
              normalizeLufs: data.normalizeLufs,
              tmpDir: tmpRoot,
              signal,
            }),
        });
        for (const fmt of data.subtitles) {
          subtitleEntries.push({
            name: `${baseName}-${sanitizeFileName(r.chapter.name)}.${fmt}`,
            content: serializeSubtitles(r.subtitles, fmt),
          });
        }
      }
    }

    const totalFiles = audioSources.length + subtitleEntries.length;

    // Decide the upload's MIME up front so buildObjectKey picks the right
    // extension. Single-audio path uses the audio's MIME, multi-file path
    // is always a zip.
    const isSingleAudio = totalFiles === 1 && audioSources.length === 1;
    uploadMime = isSingleAudio ? mimeForFormat(data.format) : "application/zip";
    const uploadKey = buildObjectKey("exports", uploadMime);
    pendingFile = uploadKey;

    let fileSize: number;
    if (isSingleAudio) {
      uploadName = audioSources[0].name;
      const { stream, done, kill } = audioSources[0].run();
      try {
        [fileSize] = await Promise.all([uploadStream(uploadKey, stream), done]);
      } catch (err) {
        // If either side fails, kill the transcode so we don't leave a
        // zombie ffmpeg waiting on a closed pipe.
        kill();
        throw err;
      }
    } else {
      uploadName = `${baseName}.zip`;
      const { downloadZip } = await import("client-zip");

      // Spawn each ffmpeg process lazily — only when client-zip is ready to
      // pull the next entry. This caps concurrent ffmpeg processes at one
      // and keeps OS pipe buffers from backing up.
      type ZipInput = {
        name: string;
        input: ReadableStream<Uint8Array> | string;
      };
      async function* zipEntries(): AsyncGenerator<ZipInput> {
        for (const src of audioSources) {
          checkAborted();
          const handle = src.run();
          // The encoder can exit while the ZIP writer is still reading its stream.
          const exit = handle.done.then(
            () => null,
            (error: Error) => error,
          );
          try {
            const input = Readable.toWeb(handle.stream) as ReadableStream<Uint8Array>;
            yield { name: src.name, input };
            const error = await exit;
            if (error) throw error;
          } finally {
            handle.kill();
          }
        }
        for (const sub of subtitleEntries) {
          yield { name: sub.name, input: sub.content };
        }
      }

      const zipResp = downloadZip(zipEntries());
      const zipWebBody = zipResp.body;
      if (!zipWebBody) throw new Error(t("ZIP body is unreadable"));
      const zipNodeBody = Readable.fromWeb(
        zipWebBody as unknown as import("node:stream/web").ReadableStream<Uint8Array>,
      );
      fileSize = await uploadStream(uploadKey, zipNodeBody);
    }

    checkAborted();
    const file = db.transaction((tx) => {
      const output = finalizeUpload(
        {
          path: uploadKey,
          fileName: uploadName,
          maxBytes: 4 * 1024 * 1024 * 1024,
          fileSize,
          fileMime: uploadMime,
        },
        tx,
      );
      tx.insert(projectExports)
        .values({
          projectId: data.projectId,
          fileId: output.id,
          settings: settingsSnapshot,
          createdAt: new Date(),
        })
        .run();
      return output;
    });
    pendingFile = undefined;
    return {
      fileId: file.id,
      fileName: uploadName,
      fileMime: uploadMime,
      fileSize,
      settings: settingsSnapshot,
    };
  } finally {
    if (pendingFile) await deleteObject(pendingFile).catch(console.error);
    await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  }
}

async function prepareChapter(
  chapter: typeof chapters.$inferSelect,
): Promise<ChapterForRender | null> {
  const generationFiles = aliasedTable(files, "generation_files");
  const segRows = await db
    .select({
      id: segments.id,
      sortOrder: segments.sortOrder,
      content: segments.content,
      leadingSilence: segments.leadingSilence,
      trailingSilence: segments.trailingSilence,
      generationPath: generationFiles.path,
      generationFileMime: generationFiles.fileMime,
      generationDuration: generationFiles.durationMs,
    })
    .from(segments)
    .leftJoin(ttsGenerations, eq(ttsGenerations.id, segments.generationId))
    .leftJoin(generationFiles, eq(generationFiles.id, ttsGenerations.fileId))
    .where(eq(segments.chapterId, chapter.id))
    .orderBy(asc(segments.sortOrder), asc(segments.id));

  const usableSegments: SegmentForRender[] = [];
  for (const s of segRows) {
    if (!s.generationPath) continue;
    const path = storageFile(s.generationPath);
    usableSegments.push({
      id: s.id,
      sortOrder: s.sortOrder,
      content: s.content,
      generationPath: path,
      generationDuration: s.generationDuration ?? 0,
      leadingSilenceOverride: s.leadingSilence,
      trailingSilenceOverride: s.trailingSilence,
    });
  }
  if (usableSegments.length === 0) return null;

  return {
    id: chapter.id,
    name: chapter.name,
    sortOrder: chapter.sortOrder,
    segments: usableSegments,
  };
}

// Simple concat: each segment followed by `segmentGapMs` silence (except last).
async function renderChapterSimple(
  ch: ChapterForRender,
  outputWavPath: string,
  signal: AbortSignal,
  segmentGapMs: number,
): Promise<void> {
  const args: string[] = ["-y"];
  for (const s of ch.segments) args.push("-i", s.generationPath);

  // Normalize each input to a common stereo / 44.1k float layout so the
  // concat filter doesn't reject inputs whose source codecs differ.
  const filters: string[] = [];
  const labels: string[] = [];
  for (let i = 0; i < ch.segments.length; i++) {
    const s = ch.segments[i];
    const isLast = i === ch.segments.length - 1;
    const lead = Math.max(0, s.leadingSilenceOverride ?? 0);
    const trail = Math.max(0, s.trailingSilenceOverride ?? (isLast ? 0 : segmentGapMs));
    const parts = [`[${i}:a]aformat=sample_fmts=fltp:channel_layouts=stereo:sample_rates=44100`];
    if (lead > 0) parts.push(`adelay=${lead}|${lead}`);
    if (trail > 0) {
      parts.push(`apad=pad_dur=${(trail / 1000).toFixed(3)}`);
    }
    filters.push(`${parts.join(",")}[s${i}]`);
    labels.push(`[s${i}]`);
  }
  filters.push(`${labels.join("")}concat=n=${ch.segments.length}:v=0:a=1[out]`);

  args.push("-filter_complex", filters.join(";"));
  args.push("-map", "[out]");
  args.push("-ac", "2", "-ar", "44100");
  args.push(outputWavPath);

  await runFFmpeg(args, signal);
}

async function concatChapterWavs(
  inputs: string[],
  gapMs: number,
  outputWav: string,
  signal: AbortSignal,
): Promise<void> {
  if (inputs.length === 0) throw new Error(t("No chapters to concatenate"));
  if (inputs.length === 1 && gapMs === 0) {
    await runFFmpeg(["-y", "-i", inputs[0], "-c:a", "pcm_s16le", outputWav], signal);
    return;
  }
  const args: string[] = ["-y"];
  for (const f of inputs) args.push("-i", f);

  const filters: string[] = [];
  const labels: string[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const isLast = i === inputs.length - 1;
    const padDur = (isLast ? 0 : gapMs) / 1000;
    if (padDur > 0) {
      filters.push(`[${i}:a]apad=pad_dur=${padDur.toFixed(3)}[c${i}]`);
      labels.push(`[c${i}]`);
    } else {
      labels.push(`[${i}:a]`);
    }
  }
  filters.push(`${labels.join("")}concat=n=${inputs.length}:v=0:a=1[out]`);
  args.push("-filter_complex", filters.join(";"));
  args.push("-map", "[out]");
  args.push("-ar", "44100");
  args.push(outputWav);
  await runFFmpeg(args, signal);
}

function spawnTranscode(opts: {
  inputPath: string;
  metadataPath: string | null;
  format: ExportFormat;
  bitrate: number;
  sampleRate: number;
  mono: boolean;
  /** Target integrated loudness in LUFS, or null to disable. */
  normalizeLufs: number | null;
  /** Tmp dir used for the m4b file path (other formats stream to stdout). */
  tmpDir: string;
  signal: AbortSignal;
}): { stream: Readable; done: Promise<void>; kill: () => void } {
  const args: string[] = ["-y", "-i", opts.inputPath];
  if (opts.metadataPath) {
    // -map_metadata picks up the [CHAPTER] sections in ffmetadata and writes
    // them to MP4's container-level chapter atom (udta/chpl). We deliberately
    // do NOT add `-map_chapters 1`: that flag tells ffmpeg to also emit a
    // separate chapter track, which Alpine's ffmpeg mis-tags as `bin_data`
    // (codec id 98314) and breaks playback in many m4b players.
    args.push("-i", opts.metadataPath, "-map_metadata", "1");
  }
  // Explicit audio-only mapping. Without this, ffmpeg's auto-mapper can pull
  // unwanted streams off the metadata input and produce phantom data tracks.
  args.push("-map", "0:a");
  args.push("-ac", opts.mono ? "1" : "2");
  args.push("-ar", String(opts.sampleRate));
  args.push("-b:a", `${opts.bitrate}k`);

  if (opts.normalizeLufs !== null) {
    const tp = opts.normalizeLufs <= -23 ? -2 : -1.5;
    args.push("-af", `loudnorm=I=${opts.normalizeLufs}:TP=${tp}:LRA=11:print_format=summary`);
  }

  if (opts.format === "mp3") {
    args.push("-c:a", "libmp3lame", "-f", "mp3", "pipe:1");
    return spawnFfmpegToStdout(args, opts.signal);
  }
  if (opts.format === "wav") {
    args.push("-c:a", "pcm_s16le", "-f", "wav", "pipe:1");
    return spawnFfmpegToStdout(args, opts.signal);
  }
  // m4b: non-fragmented MP4 + +faststart. Fragmented MP4 can't carry MP4's
  // udta/chpl chapter atom, so ffmpeg falls back to a text chapter track —
  // which Alpine's ffmpeg writes with an unsupported codec tag and trips up
  // every audiobook player we tested. Non-fragmented requires seek-on-finish
  // (ffmpeg rewrites moov), so the output goes to a temp file and we stream
  // the finished file out to the caller.
  const outPath = join(opts.tmpDir, `transcode-${randomUUID()}.m4b`);
  args.push("-c:a", "aac", "-f", "mp4", "-movflags", "+faststart", outPath);
  return spawnFfmpegToFile(args, outPath, opts.signal);
}

// Cap stderr buffering so a chatty / hung ffmpeg can't grow this string
// indefinitely. Only the trailing window matters for diagnostics anyway.
const FFMPEG_STDERR_TAIL_BYTES = 8 * 1024;

function appendStderrTail(prev: string, chunk: string): string {
  const merged = prev + chunk;
  return merged.length > FFMPEG_STDERR_TAIL_BYTES
    ? merged.slice(-FFMPEG_STDERR_TAIL_BYTES)
    : merged;
}

// File-output variant of spawnFfmpegToStdout. ffmpeg writes the full file to
// disk, then we pipe the finished file into a PassThrough so callers see the
// same `{ stream, done, kill }` shape. `done` resolves only after the file has
// been fully read out (and the temp file unlinked); upload + done can be
// awaited together exactly like the streaming variant.
function spawnFfmpegToFile(
  args: string[],
  outPath: string,
  signal: AbortSignal,
): { stream: Readable; done: Promise<void>; kill: () => void } {
  const proc = spawn(FFMPEG_BIN, args, {
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  proc.stderr?.on("data", (c) => {
    stderr = appendStderrTail(stderr, c.toString());
  });

  const passthrough = new PassThrough();
  let fileStream: ReturnType<typeof createReadStream> | null = null;

  const kill = () => {
    if (proc.exitCode === null) {
      try {
        proc.kill("SIGKILL");
      } catch {}
    }
    if (fileStream && !fileStream.destroyed) {
      fileStream.destroy();
    }
  };

  const done = new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      kill();
      reject(new CancelledError());
      return;
    }
    const onAbort = () => kill();
    signal.addEventListener("abort", onAbort);

    const fail = (err: Error) => {
      signal.removeEventListener("abort", onAbort);
      try {
        passthrough.destroy(err);
      } catch {}
      unlink(outPath).catch(() => {});
      reject(err);
    };

    proc.once("error", fail);
    proc.once("close", (code) => {
      if (signal.aborted) return fail(new CancelledError());
      if (code !== 0) {
        return fail(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`));
      }
      // ffmpeg done writing — stream the finished file out, then unlink.
      fileStream = createReadStream(outPath);
      fileStream.once("error", fail);
      fileStream.once("end", () => {
        signal.removeEventListener("abort", onAbort);
        unlink(outPath).catch(() => {});
        resolve();
      });
      fileStream.pipe(passthrough);
    });
  });

  return { stream: passthrough, done, kill };
}

function spawnFfmpegToStdout(
  args: string[],
  signal: AbortSignal,
): { stream: Readable; done: Promise<void>; kill: () => void } {
  const proc = spawn(FFMPEG_BIN, args, {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  proc.stderr?.on("data", (c) => {
    stderr = appendStderrTail(stderr, c.toString());
  });
  const stdout = proc.stdout;
  if (!stdout) throw new Error(t("ffmpeg stdout unavailable"));

  const kill = () => {
    if (proc.exitCode !== null) return;
    try {
      proc.kill("SIGKILL");
    } catch {}
  };

  const done = new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      kill();
      reject(new CancelledError());
      return;
    }
    const onAbort = () => kill();
    signal.addEventListener("abort", onAbort);
    proc.once("error", (err) => {
      signal.removeEventListener("abort", onAbort);
      // Surface to consumers reading the stream too.
      try {
        stdout.destroy(err);
      } catch {}
      reject(err);
    });
    proc.once("close", (code) => {
      signal.removeEventListener("abort", onAbort);
      if (signal.aborted) return reject(new CancelledError());
      if (code === 0) return resolve();
      const err = new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`);
      try {
        stdout.destroy(err);
      } catch {}
      reject(err);
    });
  });

  return { stream: stdout, done, kill };
}

async function probeWavDurationMs(wavPath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(
      FFPROBE_BIN,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        wavPath,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    proc.stdout.on("data", (c) => {
      out += c.toString();
    });
    proc.on("close", () => {
      const seconds = Number.parseFloat(out.trim());
      resolve(Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0);
    });
    proc.on("error", () => resolve(0));
  });
}

function buildChapterMarkers(
  renders: ChapterRender[],
  chapterGapMs: number,
): { startMs: number; endMs: number; title: string }[] {
  const markers: { startMs: number; endMs: number; title: string }[] = [];
  let cursor = 0;
  for (let i = 0; i < renders.length; i++) {
    const r = renders[i];
    const startMs = cursor;
    const endMs = cursor + r.durationMs;
    markers.push({ startMs, endMs, title: r.chapter.name });
    cursor = endMs;
    if (i < renders.length - 1) cursor += chapterGapMs;
  }
  return markers;
}

async function writeChapterMetadata(
  path: string,
  chapterMarkers: { startMs: number; endMs: number; title: string }[],
): Promise<void> {
  const lines: string[] = [";FFMETADATA1"];
  for (const ch of chapterMarkers) {
    lines.push("[CHAPTER]");
    lines.push("TIMEBASE=1/1000");
    lines.push(`START=${Math.max(0, Math.floor(ch.startMs))}`);
    lines.push(`END=${Math.max(0, Math.floor(ch.endMs))}`);
    lines.push(`title=${ch.title}`);
  }
  await writeFile(path, lines.join("\n"));
}

function buildChapterSubtitles(ch: ChapterForRender, data: ExportJobData): SubtitleEntry[] {
  if (data.subtitles.length === 0) return [];
  const entries: SubtitleEntry[] = [];
  let cursor = 0;
  for (let i = 0; i < ch.segments.length; i++) {
    const s = ch.segments[i];
    const isLast = i === ch.segments.length - 1;
    const lead = Math.max(0, s.leadingSilenceOverride ?? 0);
    const trail = Math.max(0, s.trailingSilenceOverride ?? (isLast ? 0 : data.segmentGapMs));
    const start = cursor + lead;
    const end = start + s.generationDuration;
    if (s.content?.trim()) {
      entries.push({ startMs: start, endMs: end, text: s.content.trim() });
    }
    cursor = end + trail;
  }
  return entries;
}

function serializeSubtitles(entries: SubtitleEntry[], format: SubtitleFormat): string {
  if (format === "srt") {
    return entries
      .map((e, i) => `${i + 1}\n${msToSrt(e.startMs)} --> ${msToSrt(e.endMs)}\n${e.text}\n`)
      .join("\n");
  }
  const lines: string[] = ["WEBVTT", ""];
  for (const e of entries) {
    lines.push(`${msToVtt(e.startMs)} --> ${msToVtt(e.endMs)}`);
    lines.push(e.text);
    lines.push("");
  }
  return lines.join("\n");
}

function msToSrt(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const msec = Math.floor(ms % 1000);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(msec, 3)}`;
}

function msToVtt(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const msec = Math.floor(ms % 1000);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(msec, 3)}`;
}

function pad(n: number, w: number): string {
  return String(n).padStart(w, "0");
}

function sanitizeFileName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]+/g, "_").trim();
}

function formatToExt(format: ExportFormat): string {
  if (format === "mp3") return "mp3";
  if (format === "wav") return "wav";
  return "m4b";
}

function mimeForFormat(format: ExportFormat): string {
  if (format === "mp3") return "audio/mpeg";
  if (format === "wav") return "audio/wav";
  return "audio/mp4";
}

// Wraps a Node Readable so we can know how many bytes flowed through it
// after the consumer drains it — used to record `fileSize` without buffering.

function runFFmpeg(args: string[], signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new CancelledError());
      return;
    }
    const fullArgs = [...args];
    const proc = spawn(FFMPEG_BIN, fullArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    proc.stderr?.on("data", (c) => {
      stderr = appendStderrTail(stderr, c.toString());
    });
    const onAbort = () => {
      try {
        proc.kill("SIGKILL");
      } catch {}
    };
    signal.addEventListener("abort", onAbort);
    proc.once("error", (err) => {
      signal.removeEventListener("abort", onAbort);
      reject(err);
    });
    proc.once("close", (code) => {
      signal.removeEventListener("abort", onAbort);
      if (signal.aborted) return reject(new CancelledError());
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`));
    });
  });
}

export { CancelledError as ExportCancelledError };
