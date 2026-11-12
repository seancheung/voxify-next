import { createServerFn } from "@tanstack/react-start";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  or,
  type SQL,
  sql,
  like as sqlLike,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { ttsServices, voices } from "@/db/schema";
import { t } from "@/i18n";
import { TTSServiceType } from "@/types/tts";

export type VoiceListMetadata = {
  name?: string;
  gender?: string;
  age?: string;
  language?: string;
  description?: string;
  tags?: string[];
};

export type VoiceListItem = {
  id: number;
  name: string;
  key: string;
  ttsServiceId: number;
  ttsServiceName: string;
  ttsServiceType: TTSServiceType;
  metadata: VoiceListMetadata | null;
  previewUrl: string | null;
  promptText: string | null;
  enabled: boolean | null;
  createdAt: Date;
  updatedAt: Date;
};

const listColumns = {
  id: voices.id,
  name: voices.name,
  key: voices.key,
  ttsServiceId: voices.ttsServiceId,
  ttsServiceName: ttsServices.name,
  ttsServiceType: ttsServices.type,
  ttsServiceBaseUrl: ttsServices.baseUrl,
  ttsServicePreviewBaseUrl: ttsServices.previewBaseUrl,
  metadata: sql<VoiceListMetadata | null>`${voices.metadata}`,
  previewUrl: voices.previewUrl,
  promptText: voices.promptText,
  enabled: voices.enabled,
  createdAt: voices.createdAt,
  updatedAt: voices.updatedAt,
};

function absolutizePreviewUrl(
  previewUrl: string | null,
  previewBaseUrl: string | null,
  baseUrl: string,
): string | null {
  if (!previewUrl) return null;
  if (/^https?:\/\//i.test(previewUrl)) return previewUrl;
  const base = previewBaseUrl || baseUrl;
  try {
    return new URL(previewUrl, base).toString();
  } catch {
    return previewUrl;
  }
}

const listSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(24),
  sort: z.enum(["createdAt", "name"]).default("createdAt"),
  search: z.string().trim().optional(),
  enabled: z.enum(["all", "enabled", "disabled"]).default("all"),
  ttsServiceId: z.number().int().positive().optional(),
});

export type ListVoicesInput = z.input<typeof listSchema>;
export type ListVoicesResult = {
  items: VoiceListItem[];
  nextCursor: string | null;
};

type CursorPayload = { v: string; id: number };

function encodeCursor(value: Date | string, id: number): string {
  const v = value instanceof Date ? value.toISOString() : value;
  return JSON.stringify({ v, id });
}

function decodeCursor(s: string): CursorPayload | null {
  try {
    const parsed = JSON.parse(s) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as CursorPayload).v === "string" &&
      typeof (parsed as CursorPayload).id === "number"
    ) {
      return parsed as CursorPayload;
    }
  } catch {
    // ignore malformed cursor
  }
  return null;
}

export const listVoices = createServerFn({ method: "GET" })
  .validator((data: z.input<typeof listSchema>) => listSchema.parse(data))
  .handler(async ({ data }): Promise<ListVoicesResult> => {
    const { cursor, limit, sort, search, enabled, ttsServiceId } = data;

    const where: SQL[] = [];

    if (search) {
      const like = `%${search}%`;
      const term = or(
        sqlLike(voices.key, like),
        sqlLike(voices.name, like),
        sql`${voices.metadata} LIKE ${like}`,
      );
      if (term) where.push(term);
    }

    if (enabled === "enabled") {
      where.push(eq(voices.enabled, true));
    } else if (enabled === "disabled") {
      where.push(eq(voices.enabled, false));
    }

    if (ttsServiceId) {
      where.push(eq(voices.ttsServiceId, ttsServiceId));
    }

    // Hide voices whose TTS service is disabled. getVoicesByIds intentionally
    // skips this filter so already-assigned voices continue to resolve even
    // when the service was later disabled.
    const serviceEnabled = or(eq(ttsServices.enabled, true), isNull(ttsServices.enabled));
    if (serviceEnabled) where.push(serviceEnabled);

    const parsedCursor = cursor ? decodeCursor(cursor) : null;
    if (parsedCursor) {
      const { v, id } = parsedCursor;
      if (sort === "name") {
        where.push(sql`(${voices.name}, ${voices.id}) > (${v}, ${id})`);
      } else {
        where.push(sql`(${voices.createdAt}, ${voices.id}) < (${new Date(v).getTime()}, ${id})`);
      }
    }

    const orderBy =
      sort === "name"
        ? [asc(voices.name), asc(voices.id)]
        : [desc(voices.createdAt), desc(voices.id)];

    const rows = await db
      .select(listColumns)
      .from(voices)
      .innerJoin(ttsServices, eq(ttsServices.id, voices.ttsServiceId))
      .where(where.length > 0 ? and(...where) : undefined)
      .orderBy(...orderBy)
      .limit(limit + 1);

    let nextCursor: string | null = null;
    if (rows.length > limit) {
      const last = rows[limit - 1];
      const cursorValue = sort === "name" ? last.name : last.createdAt;
      nextCursor = encodeCursor(cursorValue, last.id);
      rows.pop();
    }

    const items: VoiceListItem[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      key: row.key,
      ttsServiceId: row.ttsServiceId,
      ttsServiceName: row.ttsServiceName,
      ttsServiceType: row.ttsServiceType,
      metadata: row.metadata,
      previewUrl: absolutizePreviewUrl(
        row.previewUrl,
        row.ttsServicePreviewBaseUrl,
        row.ttsServiceBaseUrl,
      ),
      promptText: row.promptText,
      enabled: row.enabled,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    return { items, nextCursor };
  });

const idsSchema = z.object({
  ids: z.array(z.number().int().positive()).max(100),
});

export const getVoicesByIds = createServerFn({ method: "GET" })
  .validator((data: z.input<typeof idsSchema>) => idsSchema.parse(data))
  .handler(async ({ data }): Promise<VoiceListItem[]> => {
    if (data.ids.length === 0) return [];
    const rows = await db
      .select(listColumns)
      .from(voices)
      .innerJoin(ttsServices, eq(ttsServices.id, voices.ttsServiceId))
      .where(inArray(voices.id, data.ids));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      key: row.key,
      ttsServiceId: row.ttsServiceId,
      ttsServiceName: row.ttsServiceName,
      ttsServiceType: row.ttsServiceType,
      metadata: row.metadata,
      previewUrl: absolutizePreviewUrl(
        row.previewUrl,
        row.ttsServicePreviewBaseUrl,
        row.ttsServiceBaseUrl,
      ),
      promptText: row.promptText,
      enabled: row.enabled,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  });

const idSchema = z.object({ id: z.number().int().positive() });

const createSchema = z.object({
  ttsServiceId: z.number().int().positive(t("Select a TTS service")),
  key: z
    .string()
    .trim()
    .min(1, { error: () => t("Enter a voice key") })
    .max(120),
  name: z.string().trim().max(120).optional(),
});

export const createVoiceSchema = createSchema;

export const createVoice = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof createSchema>) => createSchema.parse(data))
  .handler(async ({ data }): Promise<VoiceListItem> => {
    const [svc] = await db.select().from(ttsServices).where(eq(ttsServices.id, data.ttsServiceId));
    if (!svc) throw new Error(t("TTS service not found"));
    if (svc.type !== TTSServiceType.OpenAITTS) {
      throw new Error(t("Only OpenAI TTS services support creating voices"));
    }

    const now = new Date();
    const name = data.name?.trim() || data.key;
    const [created] = await db
      .insert(voices)
      .values({
        ttsServiceId: data.ttsServiceId,
        key: data.key,
        name,
        metadata: null,
        previewUrl: null,
        promptText: null,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return {
      id: created.id,
      name: created.name,
      key: created.key,
      ttsServiceId: created.ttsServiceId,
      ttsServiceName: svc.name,
      ttsServiceType: svc.type,
      metadata: (created.metadata as VoiceListMetadata | null) ?? null,
      previewUrl: created.previewUrl,
      promptText: created.promptText,
      enabled: created.enabled,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  });

const updateSchema = z.object({
  id: z.number().int().positive(),
  key: z
    .string()
    .trim()
    .min(1, { error: () => t("Enter a voice key") })
    .max(120),
  name: z.string().trim().max(120).optional(),
});

export const updateVoiceSchema = updateSchema;

export const updateVoice = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof updateSchema>) => updateSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const [row] = await db
      .select({ id: voices.id, type: ttsServices.type })
      .from(voices)
      .innerJoin(ttsServices, eq(ttsServices.id, voices.ttsServiceId))
      .where(eq(voices.id, data.id));
    if (!row) throw new Error(t("Voice not found"));
    if (row.type !== TTSServiceType.OpenAITTS) {
      throw new Error(t("Only OpenAI TTS voices can be edited"));
    }
    const name = data.name?.trim() || data.key;
    await db
      .update(voices)
      .set({ key: data.key, name, updatedAt: new Date() })
      .where(eq(voices.id, data.id));
    return { ok: true as const };
  });

const toggleSchema = z.object({
  id: z.number().int().positive(),
  enabled: z.boolean(),
});

export const toggleVoice = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof toggleSchema>) => toggleSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await db
      .update(voices)
      .set({ enabled: data.enabled, updatedAt: new Date() })
      .where(eq(voices.id, data.id));
    return { ok: true as const };
  });

export const deleteVoice = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof idSchema>) => idSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const [row] = await db
      .select({ id: voices.id, type: ttsServices.type })
      .from(voices)
      .innerJoin(ttsServices, eq(ttsServices.id, voices.ttsServiceId))
      .where(eq(voices.id, data.id));
    if (!row) throw new Error(t("Voice not found"));
    if (row.type !== TTSServiceType.OpenAITTS) {
      throw new Error(t("Only OpenAI TTS voices can be deleted"));
    }
    await db.delete(voices).where(eq(voices.id, data.id));
    return { ok: true as const };
  });
