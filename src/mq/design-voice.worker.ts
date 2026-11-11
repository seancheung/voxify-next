import { eq } from "drizzle-orm";
import { db } from "@/db";
import { configs, ttsServices, voiceDesigns } from "@/db/schema";
import { probeDurationMsFromBuffer } from "@/lib/audio-probe.server";
import { finalizeUpload } from "@/lib/files.server";
import { buildObjectKey, deleteObject, uploadObject } from "@/lib/storage.server";
import { type AppConfig, appConfigSchema, DEFAULT_APP_CONFIG } from "@/types/app-config";
import mime from "@/utils/mime";

async function callDesign(
  baseUrl: string,
  bearerToken: string | null,
  body: { input: string; instruct: string; response_format?: string },
  timeoutMs: number,
): Promise<{ buffer: Buffer; contentType: string }> {
  const url = new URL("/v1/audio/design", baseUrl).toString();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "audio/*",
  };
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Design HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  const contentType =
    resp.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
  const buffer = Buffer.from(await resp.arrayBuffer());
  return { buffer, contentType };
}

async function loadAppConfig(): Promise<AppConfig> {
  const [row] = await db.select().from(configs).where(eq(configs.key, "app_config"));
  const parsed = appConfigSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : DEFAULT_APP_CONFIG;
}

async function processDesignJob(designId: number): Promise<void> {
  const [design] = await db.select().from(voiceDesigns).where(eq(voiceDesigns.id, designId));
  if (!design) throw new Error(`voice design ${designId} 不存在`);
  if (design.ttsServiceId == null) throw new Error("关联的 TTS 服务已被删除");

  await db
    .update(voiceDesigns)
    .set({ status: "running", errorMessage: null, updatedAt: new Date() })
    .where(eq(voiceDesigns.id, designId));

  const [service] = await db
    .select()
    .from(ttsServices)
    .where(eq(ttsServices.id, design.ttsServiceId));
  if (!service) throw new Error("TTS 服务不存在");

  const responseFormat = (service.settings?.responseFormat as string | undefined) || "mp3";
  const appConfig = await loadAppConfig();
  const timeoutMs =
    typeof service.settings?.timeout === "number" && service.settings.timeout > 0
      ? service.settings.timeout
      : appConfig.defaultTtsTimeoutMs;

  const { buffer, contentType } = await callDesign(
    service.baseUrl,
    service.bearerToken,
    {
      input: design.input,
      instruct: design.instruct,
      response_format: responseFormat,
    },
    timeoutMs,
  );

  const path = buildObjectKey("audio", contentType);
  const [duration] = await Promise.all([
    probeDurationMsFromBuffer(buffer),
    uploadObject(path, buffer),
  ]);

  if (duration <= 0) {
    deleteObject(path).catch((err) => {
      console.warn(`清理失败设计对象 ${path} 失败:`, err);
    });
    throw new Error(`无法获取音频时长 (${buffer.length}B, ${contentType})，已放弃此次生成`);
  }

  const ext = mime.getExtension(contentType) ?? "bin";
  const now = new Date();
  try {
    db.transaction((tx) => {
      const file = finalizeUpload(
        {
          path,
          fileName: `voice-design-${designId}.${ext}`,
          maxBytes: 50 * 1024 * 1024,
          fileSize: buffer.length,
          fileMime: contentType,
          durationMs: duration,
        },
        tx,
      );
      tx.update(voiceDesigns)
        .set({
          fileId: file.id,
          status: "ready",
          errorMessage: null,
          updatedAt: now,
        })
        .where(eq(voiceDesigns.id, designId))
        .run();
    });
  } catch (error) {
    await deleteObject(path);
    throw error;
  }
}

export async function runDesign(designId: number) {
  try {
    await processDesignJob(designId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(voiceDesigns)
      .set({
        status: "failed",
        errorMessage: message.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(eq(voiceDesigns.id, designId));
    throw err;
  }
}
