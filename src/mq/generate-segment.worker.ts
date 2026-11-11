import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  chapters,
  configs,
  narrators,
  projects,
  segments,
  ttsGenerations,
  ttsServices,
  voices,
} from "@/db/schema";
import { probeDurationMsFromBuffer } from "@/lib/audio-probe.server";
import { finalizeUpload } from "@/lib/files.server";
import { buildObjectKey, deleteObject, uploadObject } from "@/lib/storage.server";
import { type AppConfig, appConfigSchema, DEFAULT_APP_CONFIG } from "@/types/app-config";
import type { TTSPayload, TTSSettings, VoiceSettings } from "@/types/tts";
import mime from "@/utils/mime";

class JobCancelledError extends Error {
  constructor() {
    super("已取消");
    this.name = "JobCancelledError";
  }
}

const APP_CONFIG_KEY = "app_config";

async function loadAppConfig(): Promise<AppConfig> {
  const [row] = await db.select().from(configs).where(eq(configs.key, APP_CONFIG_KEY));
  const parsed = appConfigSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : DEFAULT_APP_CONFIG;
}

const VOICE_SETTING_KEYS = ["speed", "instructions"] as const;

function mergeSettings(
  base: TTSSettings | null | undefined,
  ...overrides: (VoiceSettings | null | undefined)[]
): TTSSettings & { customArgs?: Record<string, unknown> } {
  const result: TTSSettings & { customArgs?: Record<string, unknown> } = {
    ...(base ?? {}),
  };
  for (const override of overrides) {
    if (!override) continue;
    for (const k of VOICE_SETTING_KEYS) {
      const v = (override as Record<string, unknown>)[k];
      if (v !== undefined && v !== null && v !== "") {
        (result as Record<string, unknown>)[k] = v;
      }
    }
    if (override.customArgs && typeof override.customArgs === "object") {
      result.customArgs = {
        ...(result.customArgs ?? {}),
        ...override.customArgs,
      };
    }
  }
  return result;
}

function pickVoiceId(
  segmentVoiceId: number | null,
  hasNarrator: boolean,
  narratorVoiceId: number | null | undefined,
  chapterVoiceId: number | null,
  projectVoiceId: number | null,
): number | null {
  if (segmentVoiceId) return segmentVoiceId;
  if (narratorVoiceId) return narratorVoiceId;
  if (chapterVoiceId) return chapterVoiceId;
  // Project default voice only applies to segments without a narrator
  if (!hasNarrator && projectVoiceId) return projectVoiceId;
  return null;
}

async function callTTS(
  baseUrl: string,
  bearerToken: string | null,
  payload: TTSPayload,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<{ buffer: Buffer; contentType: string }> {
  const url = new URL("/v1/audio/speech", baseUrl).toString();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "audio/*",
  };
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;

  const body: Record<string, unknown> = {
    ...(payload.customArgs ?? {}),
    input: payload.input,
    voice: payload.voice,
  };
  if (payload.model) body.model = payload.model;
  if (payload.speed !== undefined) body.speed = payload.speed;
  if (payload.instructions) body.instructions = payload.instructions;
  if (payload.responseFormat) body.response_format = payload.responseFormat;

  const signals: AbortSignal[] = [AbortSignal.timeout(timeoutMs)];
  if (externalSignal) signals.push(externalSignal);
  const signal = signals.length === 1 ? signals[0] : AbortSignal.any(signals);

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`TTS HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  const contentType =
    resp.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
  const buffer = Buffer.from(await resp.arrayBuffer());
  return { buffer, contentType };
}

export async function processTTSJob(segmentId: number, signal: AbortSignal): Promise<void> {
  const [segment] = await db.select().from(segments).where(eq(segments.id, segmentId));
  if (!segment) throw new Error(`segment ${segmentId} 不存在`);

  const content = (segment.content ?? "").trim();
  if (!content) throw new Error("segment content 为空");

  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, segment.chapterId));
  if (!chapter) throw new Error("chapter 不存在");

  const [project] = await db.select().from(projects).where(eq(projects.id, chapter.projectId));
  if (!project) throw new Error("project 不存在");

  let narrator: typeof narrators.$inferSelect | undefined;
  if (segment.narratorId) {
    [narrator] = await db.select().from(narrators).where(eq(narrators.id, segment.narratorId));
  }

  const appConfig = await loadAppConfig();
  const voiceId = pickVoiceId(
    segment.voiceId,
    !!segment.narratorId,
    narrator?.voiceId ?? null,
    chapter.voiceId,
    project.voiceId,
  );
  if (!voiceId) throw new Error("没有可用的 voice");

  const [voice] = await db.select().from(voices).where(eq(voices.id, voiceId));
  if (!voice) throw new Error("voice 不存在");

  const [service] = await db
    .select()
    .from(ttsServices)
    .where(eq(ttsServices.id, voice.ttsServiceId));
  if (!service) throw new Error("TTS 服务不存在");

  const merged = mergeSettings(
    service.settings,
    segment.narratorId ? undefined : project.settings?.voiceSettings,
    narrator?.voiceSettings,
    segment.voiceSettings,
  );

  const payload: TTSPayload = {
    input: content,
    voice: voice.key,
    model: merged.model as string | undefined,
    speed: merged.speed as string | undefined,
    instructions: merged.instructions as string | undefined,
    responseFormat: merged.responseFormat as string | undefined,
    customArgs: merged.customArgs,
  };

  const timeoutMs =
    typeof merged.timeout === "number" && merged.timeout > 0
      ? merged.timeout
      : appConfig.defaultTtsTimeoutMs;

  if (signal.aborted) throw new JobCancelledError();
  let buffer: Buffer;
  let contentType: string;
  try {
    const result = await callTTS(service.baseUrl, service.bearerToken, payload, timeoutMs, signal);
    buffer = result.buffer;
    contentType = result.contentType;
  } catch (err) {
    if (signal.aborted) throw new JobCancelledError();
    throw err;
  }
  if (signal.aborted) throw new JobCancelledError();

  const path = buildObjectKey("audio", contentType);
  const [duration] = await Promise.all([
    probeDurationMsFromBuffer(buffer),
    uploadObject(path, buffer),
  ]);

  if (duration <= 0) {
    deleteObject(path).catch((err) => {
      console.warn(`清理失败生成对象 ${path} 失败:`, err);
    });
    throw new Error(`无法获取音频时长 (${buffer.length}B, ${contentType})，已放弃此次生成`);
  }

  const ext = mime.getExtension(contentType) ?? "bin";
  const now = new Date();
  try {
    signal.throwIfAborted();
    db.transaction((tx) => {
      const file = finalizeUpload(
        {
          path,
          fileName: `segment-${segmentId}.${ext}`,
          maxBytes: 50 * 1024 * 1024,
          fileSize: buffer.length,
          fileMime: contentType,
          durationMs: duration,
        },
        tx,
      );
      const [generation] = tx
        .insert(ttsGenerations)
        .values({
          projectId: chapter.projectId,
          segmentId,
          fileId: file.id,
          payload,
          serviceUrl: service.baseUrl,
          createdAt: now,
        })
        .returning({ id: ttsGenerations.id })
        .all();
      tx.update(segments)
        .set({
          generationId: generation.id,
          isStale: false,
          updatedAt: now,
        })
        .where(eq(segments.id, segmentId))
        .run();
    });
  } catch (error) {
    await deleteObject(path);
    throw error;
  }
}
