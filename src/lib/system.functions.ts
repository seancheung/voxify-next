import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServerFn } from "@tanstack/react-start";

function exec(bin: string, args: string[]) {
  return promisify(execFile)(bin, args);
}

const REQUIRED_ENCODERS = ["libmp3lame", "aac", "alac", "pcm_s16le"] as const;

export type RequiredEncoder = (typeof REQUIRED_ENCODERS)[number];

export interface FFToolInfo {
  installed: boolean;
  path: string | null;
  version: string | null;
  encoders: Record<RequiredEncoder, boolean>;
}

export interface SystemInfo {
  ffmpeg: FFToolInfo;
  ffprobe: FFToolInfo;
}

async function which(bin: string): Promise<string | null> {
  const cmd = process.platform === "win32" ? "where" : "which";
  try {
    const { stdout } = await exec(cmd, [bin]);
    const first = stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean);
    return first ?? null;
  } catch {
    return null;
  }
}

function parseVersion(stdout: string): string | null {
  const line = stdout.split(/\r?\n/, 1)[0] ?? "";
  const match = line.match(/version\s+(\S+)/);
  return match ? match[1] : null;
}

async function probeTool(bin: "ffmpeg" | "ffprobe"): Promise<FFToolInfo> {
  const path = await which(bin);
  const empty: Record<RequiredEncoder, boolean> = {
    libmp3lame: false,
    aac: false,
    alac: false,
    pcm_s16le: false,
  };
  if (!path) {
    return { installed: false, path: null, version: null, encoders: empty };
  }

  let version: string | null = null;
  try {
    const { stdout } = await exec(bin, ["-version"]);
    version = parseVersion(stdout);
  } catch {
    return { installed: false, path, version: null, encoders: empty };
  }

  const encoders = { ...empty };
  if (bin === "ffmpeg") {
    try {
      const { stdout } = await exec(bin, ["-hide_banner", "-encoders"]);
      for (const name of REQUIRED_ENCODERS) {
        encoders[name] = new RegExp(`\\s${name}\\s`).test(stdout);
      }
    } catch {
      // ignore — encoders left as false
    }
  }

  return { installed: true, path, version, encoders };
}

export const getSystemInfo = createServerFn({ method: "GET" }).handler(
  async (): Promise<SystemInfo> => {
    const [ffmpeg, ffprobe] = await Promise.all([probeTool("ffmpeg"), probeTool("ffprobe")]);
    return { ffmpeg, ffprobe };
  },
);
