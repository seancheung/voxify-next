import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { files, ttsServices, type VoiceDesignStatus, voiceDesigns } from "@/db/schema";
import { t } from "@/i18n";

export type VoiceDesignListItem = {
  id: number;
  name: string;
  ttsServiceId: number | null;
  ttsServiceName: string | null;
  instruct: string;
  input: string;
  status: VoiceDesignStatus;
  errorMessage: string | null;
  fileId: number | null;
  fileMime: string | null;
  durationMs: number | null;
  createdAt: Date;
  updatedAt: Date;
};

const listColumns = {
  id: voiceDesigns.id,
  name: voiceDesigns.name,
  ttsServiceId: voiceDesigns.ttsServiceId,
  ttsServiceName: ttsServices.name,
  instruct: voiceDesigns.instruct,
  input: voiceDesigns.input,
  status: voiceDesigns.status,
  errorMessage: voiceDesigns.errorMessage,
  fileId: voiceDesigns.fileId,
  fileMime: files.fileMime,
  durationMs: files.durationMs,
  createdAt: voiceDesigns.createdAt,
  updatedAt: voiceDesigns.updatedAt,
};

function toListItem(row: {
  id: number;
  name: string;
  ttsServiceId: number | null;
  ttsServiceName: string | null;
  instruct: string;
  input: string;
  status: VoiceDesignStatus;
  errorMessage: string | null;
  fileId: number | null;
  fileMime: string | null;
  durationMs: number | null;
  createdAt: Date;
  updatedAt: Date;
}): VoiceDesignListItem {
  return { ...row };
}

const listSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(24),
});

export type ListVoiceDesignsResult = {
  items: VoiceDesignListItem[];
  nextCursor: string | null;
};

type CursorPayload = { v: string; id: number };

function encodeCursor(value: Date, id: number): string {
  return JSON.stringify({ v: value.toISOString(), id });
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
    // ignore
  }
  return null;
}

export const listVoiceDesigns = createServerFn({ method: "GET" })
  .validator((data: z.input<typeof listSchema>) => listSchema.parse(data))
  .handler(async ({ data }): Promise<ListVoiceDesignsResult> => {
    const { cursor, limit } = data;
    const parsedCursor = cursor ? decodeCursor(cursor) : null;

    const where = parsedCursor
      ? or(
          lt(voiceDesigns.createdAt, new Date(parsedCursor.v)),
          and(
            eq(voiceDesigns.createdAt, new Date(parsedCursor.v)),
            lt(voiceDesigns.id, parsedCursor.id),
          ),
        )
      : undefined;

    const rows = await db
      .select(listColumns)
      .from(voiceDesigns)
      .leftJoin(ttsServices, eq(ttsServices.id, voiceDesigns.ttsServiceId))
      .leftJoin(files, eq(files.id, voiceDesigns.fileId))
      .where(where)
      .orderBy(desc(voiceDesigns.createdAt), desc(voiceDesigns.id))
      .limit(limit + 1);

    let nextCursor: string | null = null;
    if (rows.length > limit) {
      const last = rows[limit - 1];
      nextCursor = encodeCursor(last.createdAt, last.id);
      rows.pop();
    }

    return { items: rows.map(toListItem), nextCursor };
  });

export const createVoiceDesignSchema = z.object({
  ttsServiceId: z.number().int().positive(t("Select a TTS service")),
  name: z
    .string()
    .trim()
    .min(1, { error: () => t("Enter a name") })
    .max(120),
  instruct: z
    .string()
    .trim()
    .min(1, { error: () => t("Enter a voice description") })
    .max(1000),
  input: z
    .string()
    .trim()
    .min(1, { error: () => t("Enter sample text") })
    .max(8000),
});

export const createVoiceDesign = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof createVoiceDesignSchema>) => createVoiceDesignSchema.parse(data))
  .handler(async ({ data }): Promise<VoiceDesignListItem> => {
    const [svc] = await db.select().from(ttsServices).where(eq(ttsServices.id, data.ttsServiceId));
    if (!svc) throw new Error(t("TTS service not found"));
    if (!svc.capabilities?.design) {
      throw new Error(t("This TTS service does not support voice design"));
    }

    const now = new Date();
    const [created] = await db
      .insert(voiceDesigns)
      .values({
        name: data.name,
        ttsServiceId: data.ttsServiceId,
        instruct: data.instruct,
        input: data.input,
        status: "pending",
        errorMessage: null,
        fileId: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const { addDesignVoiceJob } = await import("@/mq/design-voice.server");
    try {
      await addDesignVoiceJob({ designId: created.id });
    } catch (error) {
      await db
        .update(voiceDesigns)
        .set({
          status: "failed",
          errorMessage: String(error),
          updatedAt: new Date(),
        })
        .where(eq(voiceDesigns.id, created.id));
      throw error;
    }

    return {
      id: created.id,
      name: created.name,
      ttsServiceId: created.ttsServiceId,
      ttsServiceName: svc.name,
      instruct: created.instruct,
      input: created.input,
      status: created.status,
      errorMessage: created.errorMessage,
      fileId: null,
      fileMime: null,
      durationMs: null,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  });

const renameSchema = z.object({
  id: z.number().int().positive(),
  name: z
    .string()
    .trim()
    .min(1, { error: () => t("Enter a name") })
    .max(120),
});

export const renameVoiceDesignSchema = renameSchema;

export const renameVoiceDesign = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof renameSchema>) => renameSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await db
      .update(voiceDesigns)
      .set({ name: data.name, updatedAt: new Date() })
      .where(eq(voiceDesigns.id, data.id));
    return { ok: true as const };
  });

const idSchema = z.object({ id: z.number().int().positive() });

export const deleteVoiceDesign = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof idSchema>) => idSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const [row] = await db
      .select({ id: voiceDesigns.id, fileId: voiceDesigns.fileId })
      .from(voiceDesigns)
      .where(eq(voiceDesigns.id, data.id));
    if (!row) return { ok: true as const };
    const { deleteFileWithObject } = await import("@/lib/files.server");
    db.transaction((tx) => {
      tx.delete(voiceDesigns).where(eq(voiceDesigns.id, data.id)).run();
      if (row.fileId != null) deleteFileWithObject(row.fileId, tx);
    });
    return { ok: true as const };
  });

export const getVoiceDesignPreviewUrl = createServerFn({ method: "GET" })
  .validator((data: z.input<typeof idSchema>) => idSchema.parse(data))
  .handler(async ({ data }): Promise<{ url: string }> => {
    const [row] = await db
      .select({
        path: files.path,
        fileMime: files.fileMime,
        fileName: files.fileName,
      })
      .from(voiceDesigns)
      .innerJoin(files, eq(files.id, voiceDesigns.fileId))
      .where(eq(voiceDesigns.id, data.id));
    if (!row) throw new Error(t("Voice file not found"));
    const { fileDownloadUrl } = await import("@/lib/files.server");
    const url = await fileDownloadUrl(row);
    return { url };
  });

export const getVoiceDesignDownloadInfo = createServerFn({ method: "GET" })
  .validator((data: z.input<typeof idSchema>) => idSchema.parse(data))
  .handler(async ({ data }): Promise<{ url: string; audioFileName: string }> => {
    const { default: mime } = await import("@/utils/mime");
    const [row] = await db
      .select({
        name: voiceDesigns.name,
        path: files.path,
        fileMime: files.fileMime,
        fileName: files.fileName,
      })
      .from(voiceDesigns)
      .innerJoin(files, eq(files.id, voiceDesigns.fileId))
      .where(eq(voiceDesigns.id, data.id));
    if (!row) throw new Error(t("Voice file not found"));
    const { fileDownloadUrl } = await import("@/lib/files.server");
    const ext = mime.getExtension(row.fileMime) ?? "bin";
    // No `asAttachment` — the client fetches the bytes and re-wraps them
    // in a zip; the browser's Content-Disposition handling is irrelevant.
    const url = await fileDownloadUrl(row);
    return { url, audioFileName: `${row.name}.${ext}` };
  });

const hasRunningSchema = z.object({}).optional();

export const hasRunningVoiceDesigns = createServerFn({ method: "GET" })
  .validator((data: z.input<typeof hasRunningSchema>) => hasRunningSchema.parse(data) ?? {})
  .handler(async (): Promise<{ count: number }> => {
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(voiceDesigns)
      .where(or(eq(voiceDesigns.status, "pending"), eq(voiceDesigns.status, "running")));
    return { count: row?.count ?? 0 };
  });

export const listDesignJobs = createServerFn({ method: "GET" }).handler(async () => {
  const { snapshot, info } = await import("@/mq/queue.server");
  const { jobs, counts } = await snapshot("design-voice", (job) => ({
    ...info(job),
    designId: Number(job.args[0]),
  }));
  const designs = jobs.length
    ? db
        .select({ id: voiceDesigns.id, name: voiceDesigns.name })
        .from(voiceDesigns)
        .where(
          inArray(
            voiceDesigns.id,
            jobs.map((job) => job.designId),
          ),
        )
        .all()
    : [];
  const names = new Map(designs.map((design) => [design.id, design.name]));
  return {
    counts,
    jobs: jobs.map((job) => ({
      ...job,
      name: names.get(job.designId) ?? null,
    })),
  };
});

export const getDesignJobsSummary = createServerFn({ method: "GET" }).handler(async () => {
  const { counts } = await import("@/mq/queue.server");
  const { active, pending, failed } = counts("design-voice");
  return { hasRunning: active + pending > 0, hasFailed: failed > 0 };
});
