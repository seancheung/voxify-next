import { spawn } from "node:child_process";
import { t } from "@/i18n";

const FFPROBE_BIN = process.env.FFPROBE_PATH ?? "ffprobe";

const PROBE_ARGS = [
  "-v",
  "error",
  "-show_entries",
  "format=duration",
  "-of",
  "default=noprint_wrappers=1:nokey=1",
];

function parseDurationOutput(out: string): number {
  const seconds = Number.parseFloat(out.trim());
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0;
}

function logProbeFailure(source: string, stderr: string, raw: string) {
  const tail = stderr.trim().slice(-500);
  console.warn(
    t(
      "ffprobe could not determine duration ({0}): output={1}{2}",
      source,
      JSON.stringify(raw.trim()),
      tail ? `\nstderr: ${tail}` : "",
    ),
  );
}

// Streaming WAV producers (OpenAI-compatible TTS in particular) emit a RIFF
// header whose `data` chunk size is a placeholder — typically 0,
// 0xFFFFFFFF, or a fixed write-buffer size — and never patch it after the
// audio finishes. ffprobe trusts the header, so reading from stdin yields
// either 0 or a constant garbage duration (we've seen 743ms = 32768B /
// (22050Hz * 2bytes)). Walking the chunks ourselves and falling back to the
// real buffer length when the declared size is bogus gives an honest answer
// without spawning ffprobe.
function probeWavDurationMs(buffer: Buffer): number | null {
  if (buffer.length < 44) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF") return null;
  if (buffer.toString("ascii", 8, 12) !== "WAVE") return null;

  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataSize = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const declared = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    if (chunkId === "fmt ") {
      if (dataStart + 16 > buffer.length) return null;
      channels = buffer.readUInt16LE(dataStart + 2);
      sampleRate = buffer.readUInt32LE(dataStart + 4);
      bitsPerSample = buffer.readUInt16LE(dataStart + 14);
    } else if (chunkId === "data") {
      // probeDurationMsFromBuffer is only fed full TTS output buffers,
      // which never carry trailing chunks past `data`. Always use the real
      // remaining byte count rather than the (often bogus) declared size.
      dataSize = Math.max(0, buffer.length - dataStart);
      break;
    }
    // RIFF chunks are word-aligned. Guard against malformed headers that
    // would loop forever or run past the buffer.
    const next = dataStart + declared + (declared % 2);
    if (next <= offset || next > buffer.length) break;
    offset = next;
  }

  if (sampleRate <= 0 || channels <= 0 || bitsPerSample <= 0 || dataSize <= 0) {
    return null;
  }
  const seconds = dataSize / (sampleRate * channels * (bitsPerSample / 8));
  return seconds > 0 ? Math.round(seconds * 1000) : null;
}

export async function probeDurationMsFromBuffer(buffer: Buffer): Promise<number> {
  // WAV is a simple format and ffprobe-via-stdin is unreliable for it (see
  // the comment on probeWavDurationMs). Parse it ourselves first.
  const wav = probeWavDurationMs(buffer);
  if (wav != null && wav > 0) return wav;

  return await new Promise<number>((resolve) => {
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(FFPROBE_BIN, [...PROBE_ARGS, "-"], {
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      console.warn(t("Failed to start ffprobe:"), err);
      resolve(0);
      return;
    }
    let out = "";
    let stderr = "";
    proc.stdout?.on("data", (c: Buffer) => {
      out += c.toString();
    });
    proc.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString();
    });
    proc.stdin?.on("error", () => {
      // ffprobe may close stdin once it has enough bytes; swallow EPIPE.
    });
    proc.once("error", (err) => {
      console.warn(t("ffprobe unavailable:"), err.message);
      resolve(0);
    });
    proc.once("close", () => {
      const ms = parseDurationOutput(out);
      if (ms <= 0) logProbeFailure(`buffer ${buffer.length}B`, stderr, out);
      resolve(ms);
    });
    proc.stdin?.end(buffer);
  });
}
