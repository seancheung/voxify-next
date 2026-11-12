import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { type TTSServiceRow, ttsServices, voices } from "@/db/schema";
import { t } from "@/i18n";
import {
  type TTSCapabilities,
  TTSServiceType,
  type TTSSettings,
  type VoiceMetadata,
} from "@/types/tts";

// TTSSettings carries an `[k: string]: unknown` index signature so we can
// stash provider-specific keys at runtime, but TanStack Start's serialization
// check refuses `unknown`. Project a known-key view onto the wire.
export type TTSServiceSettingsView = {
  model?: string;
  responseFormat?: string;
  timeout?: number;
  speed?: string;
  instructions?: string;
};

export interface TTSServiceListItem {
  id: number;
  name: string;
  type: TTSServiceType;
  baseUrl: string;
  previewBaseUrl: string | null;
  capabilities: TTSCapabilities | null;
  sampleRate: number | null;
  settings: TTSServiceSettingsView | null;
  enabled: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}

const listColumns = {
  id: ttsServices.id,
  name: ttsServices.name,
  type: ttsServices.type,
  baseUrl: ttsServices.baseUrl,
  previewBaseUrl: ttsServices.previewBaseUrl,
  capabilities: ttsServices.capabilities,
  sampleRate: ttsServices.sampleRate,
  settings: ttsServices.settings,
  enabled: ttsServices.enabled,
  createdAt: ttsServices.createdAt,
  updatedAt: ttsServices.updatedAt,
};

type ListColumnsRow = Pick<TTSServiceRow, keyof typeof listColumns>;

function toListItem(row: ListColumnsRow): TTSServiceListItem {
  // The row's settings type carries TTSSettings's `[k: string]: unknown`
  // index signature, which the server-fn serialization check rejects. The
  // wire-side view only declares the keys we control, so narrow here.
  const { settings, ...rest } = row;
  return {
    ...rest,
    settings: settings
      ? {
          model: settings.model,
          responseFormat: settings.responseFormat,
          timeout: settings.timeout,
          speed: settings.speed,
          instructions: settings.instructions,
        }
      : null,
  };
}

export const listTTSServices = createServerFn({ method: "GET" }).handler(
  async (): Promise<TTSServiceListItem[]> => {
    const rows = await db.select(listColumns).from(ttsServices).orderBy(ttsServices.createdAt);
    return rows.map(toListItem);
  },
);

const idSchema = z.object({ id: z.number().int().positive() });

const settingsSchema = z
  .object({
    model: z.string().optional(),
    responseFormat: z.string().optional(),
    timeout: z.number().int().min(1000).max(600_000).optional(),
    speed: z.string().optional(),
    instructions: z.string().optional(),
  })
  .partial()
  .passthrough()
  .optional()
  .nullable();

const baseFields = {
  name: z
    .string()
    .trim()
    .min(1, { error: () => t("Enter a name") })
    .max(120),
  type: z.union([z.literal(TTSServiceType.OpenTTS), z.literal(TTSServiceType.OpenAITTS)]),
  baseUrl: z
    .string()
    .trim()
    .min(1, { error: () => t("Enter a base URL") })
    .url({ error: () => t("Invalid URL") }),
  previewBaseUrl: z
    .string()
    .trim()
    .url({ error: () => t("Invalid URL") })
    .or(z.literal(""))
    .nullable()
    .optional(),
  bearerToken: z.string().trim().nullable(),
  settings: settingsSchema,
};

export const createTTSServiceSchema = z.object(baseFields);
export const updateTTSServiceSchema = z.object({
  id: z.number().int().positive(),
  ...baseFields,
});

interface HealthzResponse {
  status?: string;
  sample_rate?: number;
  capabilities?: TTSCapabilities;
}

async function fetchHealthz(
  baseUrl: string,
  bearerToken: string | null | undefined,
  timeoutMs = 10_000,
): Promise<HealthzResponse> {
  const url = new URL("/healthz", baseUrl).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
    const resp = await fetch(url, { headers, signal: controller.signal });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${await safeText(resp)}`);
    }
    const json = (await resp.json()) as HealthzResponse;
    if (!json || typeof json !== "object" || !json.capabilities) {
      throw new Error(t("Response is missing capabilities"));
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function safeText(resp: Response): Promise<string> {
  try {
    const text = await resp.text();
    return text.slice(0, 200);
  } catch {
    return "";
  }
}

export const createTTSService = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof createTTSServiceSchema>) => createTTSServiceSchema.parse(data))
  .handler(async ({ data }): Promise<TTSServiceListItem> => {
    const now = new Date();
    let capabilities: TTSCapabilities | null = null;
    let sampleRate: number | null = null;

    if (data.type === TTSServiceType.OpenTTS) {
      const health = await fetchHealthz(data.baseUrl, data.bearerToken);
      capabilities = health.capabilities ?? null;
      sampleRate = health.sample_rate ?? null;
    }

    const [created] = await db
      .insert(ttsServices)
      .values({
        name: data.name,
        type: data.type,
        baseUrl: data.baseUrl,
        previewBaseUrl: data.previewBaseUrl ? data.previewBaseUrl : null,
        bearerToken: data.bearerToken ? data.bearerToken : null,
        capabilities,
        sampleRate,
        settings: (data.settings as TTSSettings | null | undefined) ?? null,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning(listColumns);
    return toListItem(created);
  });

export const updateTTSService = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof updateTTSServiceSchema>) => updateTTSServiceSchema.parse(data))
  .handler(async ({ data }): Promise<TTSServiceListItem> => {
    const now = new Date();
    const updates: Partial<typeof ttsServices.$inferInsert> = {
      name: data.name,
      type: data.type,
      baseUrl: data.baseUrl,
      previewBaseUrl: data.previewBaseUrl ? data.previewBaseUrl : null,
      settings: (data.settings as TTSSettings | null | undefined) ?? null,
      updatedAt: now,
    };
    if (data.bearerToken && data.bearerToken !== "") {
      updates.bearerToken = data.bearerToken;
    }
    const [updated] = await db
      .update(ttsServices)
      .set(updates)
      .where(eq(ttsServices.id, data.id))
      .returning(listColumns);
    if (!updated) throw new Error(t("TTS service not found"));
    return toListItem(updated);
  });

const toggleSchema = z.object({
  id: z.number().int().positive(),
  enabled: z.boolean(),
});

export const toggleTTSService = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof toggleSchema>) => toggleSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await db
      .update(ttsServices)
      .set({ enabled: data.enabled, updatedAt: new Date() })
      .where(eq(ttsServices.id, data.id));
    return { ok: true as const };
  });

export const deleteTTSService = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof idSchema>) => idSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await db.delete(ttsServices).where(eq(ttsServices.id, data.id));
    return { ok: true as const };
  });

export const testTTSService = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof idSchema>) => idSchema.parse(data))
  .handler(
    async ({
      data,
    }): Promise<{
      status: string;
      sampleRate: number | null;
      capabilities: TTSCapabilities | null;
      latencyMs: number;
    }> => {
      const [svc] = await db.select().from(ttsServices).where(eq(ttsServices.id, data.id));
      if (!svc) throw new Error(t("TTS service not found"));
      if (svc.type !== TTSServiceType.OpenTTS) {
        throw new Error(t("This service does not support connection tests"));
      }
      const start = Date.now();
      const health = await fetchHealthz(svc.baseUrl, svc.bearerToken);
      const latencyMs = Date.now() - start;

      await db
        .update(ttsServices)
        .set({
          capabilities: health.capabilities ?? null,
          sampleRate: health.sample_rate ?? null,
          updatedAt: new Date(),
        })
        .where(eq(ttsServices.id, data.id));

      return {
        status: health.status ?? "ok",
        sampleRate: health.sample_rate ?? null,
        capabilities: health.capabilities ?? null,
        latencyMs,
      };
    },
  );

interface RemoteVoice {
  id: string;
  preview_url?: string | null;
  prompt_text?: string | null;
  metadata?: VoiceMetadata | null;
}

async function fetchRemoteVoices(
  baseUrl: string,
  bearerToken: string | null | undefined,
): Promise<RemoteVoice[]> {
  const url = new URL("/v1/audio/voices", baseUrl).toString();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const resp = await fetch(url, { headers, signal: controller.signal });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${await safeText(resp)}`);
    }
    const json = (await resp.json()) as { voices?: RemoteVoice[] };
    return json.voices ?? [];
  } finally {
    clearTimeout(timer);
  }
}

function nameOf(v: RemoteVoice): string {
  return v.metadata?.name?.toString().trim() || v.id;
}

export const syncTTSVoices = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof idSchema>) => idSchema.parse(data))
  .handler(
    async ({
      data,
    }): Promise<{
      added: number;
      updated: number;
      removed: number;
      total: number;
    }> => {
      const [svc] = await db.select().from(ttsServices).where(eq(ttsServices.id, data.id));
      if (!svc) throw new Error(t("TTS service not found"));
      if (svc.type !== TTSServiceType.OpenTTS) {
        throw new Error(t("This service does not support voice sync"));
      }
      const remote = await fetchRemoteVoices(svc.baseUrl, svc.bearerToken);
      const existing = await db.select().from(voices).where(eq(voices.ttsServiceId, svc.id));

      const existingByKey = new Map(existing.map((v) => [v.key, v]));
      const remoteKeys = new Set(remote.map((v) => v.id));
      const now = new Date();

      let added = 0;
      let updated = 0;

      for (const r of remote) {
        const cur = existingByKey.get(r.id);
        const name = nameOf(r);
        const metadata = r.metadata ?? null;
        const previewUrl = r.preview_url ?? null;
        const promptText = r.prompt_text ?? null;
        if (!cur) {
          await db.insert(voices).values({
            ttsServiceId: svc.id,
            key: r.id,
            name,
            metadata,
            previewUrl,
            promptText,
            enabled: true,
            createdAt: now,
            updatedAt: now,
          });
          added += 1;
        } else {
          const changed =
            cur.name !== name ||
            JSON.stringify(cur.metadata ?? null) !== JSON.stringify(metadata) ||
            cur.previewUrl !== previewUrl ||
            cur.promptText !== promptText;
          if (changed) {
            await db
              .update(voices)
              .set({
                name,
                metadata,
                previewUrl,
                promptText,
                updatedAt: now,
              })
              .where(eq(voices.id, cur.id));
            updated += 1;
          }
        }
      }

      const stale = existing.filter((v) => !remoteKeys.has(v.key));
      let removed = 0;
      if (stale.length > 0) {
        await db.delete(voices).where(
          and(
            eq(voices.ttsServiceId, svc.id),
            inArray(
              voices.id,
              stale.map((v) => v.id),
            ),
          ),
        );
        removed = stale.length;
      }

      return { added, updated, removed, total: remote.length };
    },
  );
