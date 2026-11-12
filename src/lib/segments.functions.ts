import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { chapters, files, narrators, segments, ttsGenerations } from "@/db/schema";
import { t } from "@/i18n";
import type { TTSPayload, VoiceSettings } from "@/types/tts";

const draftSegmentSchema = z.object({
  narratorName: z.string().trim().min(1).max(120).nullable(),
  text: z.string().trim().min(1).max(20000),
});

export type SegmentListItem = {
  id: number;
  chapterId: number;
  narratorId: number | null;
  narratorName: string | null;
  voiceId: number | null;
  generationId: number | null;
  content: string | null;
  voiceSettings: VoiceSettings | null;
  sortOrder: number;
  isStale: boolean;
  /** ms; null = follow project / global default */
  leadingSilence: number | null;
  /** ms; null = follow project / global default */
  trailingSilence: number | null;
  hasGeneration: boolean;
  generationCount: number;
  createdAt: Date;
  updatedAt: Date;
};

const chapterIdSchema = z.object({
  chapterId: z.number().int().positive(),
});

export const listSegmentsByChapter = createServerFn({ method: "GET" })
  .validator((data: z.input<typeof chapterIdSchema>) => chapterIdSchema.parse(data))
  .handler(async ({ data }): Promise<SegmentListItem[]> => {
    const rows = await db
      .select({
        id: segments.id,
        chapterId: segments.chapterId,
        narratorId: segments.narratorId,
        narratorName: narrators.name,
        voiceId: segments.voiceId,
        generationId: segments.generationId,
        content: segments.content,
        voiceSettings: segments.voiceSettings,
        sortOrder: segments.sortOrder,
        isStale: segments.isStale,
        leadingSilence: segments.leadingSilence,
        trailingSilence: segments.trailingSilence,
        createdAt: segments.createdAt,
        updatedAt: segments.updatedAt,
      })
      .from(segments)
      .leftJoin(narrators, eq(narrators.id, segments.narratorId))
      .where(eq(segments.chapterId, data.chapterId))
      .orderBy(asc(segments.sortOrder), asc(segments.id));

    if (rows.length === 0) return [];

    const segmentIds = rows.map((r) => r.id);
    const countRows = await db
      .select({
        segmentId: ttsGenerations.segmentId,
        count: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(ttsGenerations)
      .where(inArray(ttsGenerations.segmentId, segmentIds))
      .groupBy(ttsGenerations.segmentId);
    const countBySegment = new Map<number, number>();
    for (const row of countRows) {
      if (row.segmentId != null) countBySegment.set(row.segmentId, row.count);
    }

    return rows.map((r) => {
      const generationCount = countBySegment.get(r.id) ?? 0;
      return {
        id: r.id,
        chapterId: r.chapterId,
        narratorId: r.narratorId,
        narratorName: r.narratorName,
        voiceId: r.voiceId,
        generationId: r.generationId,
        content: r.content,
        voiceSettings: r.voiceSettings,
        sortOrder: r.sortOrder,
        isStale: r.isStale ?? false,
        leadingSilence: r.leadingSilence,
        trailingSilence: r.trailingSilence,
        hasGeneration: r.generationId != null && generationCount > 0,
        generationCount,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    });
  });

export const updateSegmentSchema = z.object({
  id: z.number().int().positive(),
  content: z.string().max(20000).nullable(),
  narratorId: z.number().int().positive().nullable(),
  voiceSettings: z
    .object({
      speed: z.string().optional(),
      instructions: z.string().optional(),
    })
    .nullable(),
  leadingSilence: z.number().int().min(0).max(600_000).nullable().optional(),
  trailingSilence: z.number().int().min(0).max(600_000).nullable().optional(),
});

export const updateSegment = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof updateSegmentSchema>) => updateSegmentSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const now = new Date();
    const [existing] = await db
      .select({
        content: segments.content,
        narratorId: segments.narratorId,
        voiceSettings: segments.voiceSettings,
      })
      .from(segments)
      .where(eq(segments.id, data.id));
    if (!existing) throw new Error(t("Segment not found"));
    const ttsChanged =
      existing.content !== data.content ||
      existing.narratorId !== data.narratorId ||
      JSON.stringify(existing.voiceSettings ?? null) !== JSON.stringify(data.voiceSettings ?? null);

    const patch: {
      content: string | null;
      narratorId: number | null;
      voiceSettings: VoiceSettings | null;
      isStale?: boolean;
      updatedAt: Date;
      leadingSilence?: number | null;
      trailingSilence?: number | null;
    } = {
      content: data.content,
      narratorId: data.narratorId,
      voiceSettings: data.voiceSettings,
      updatedAt: now,
    };
    if (ttsChanged) patch.isStale = true;
    if (data.leadingSilence !== undefined) patch.leadingSilence = data.leadingSilence;
    if (data.trailingSilence !== undefined) patch.trailingSilence = data.trailingSilence;
    await db.update(segments).set(patch).where(eq(segments.id, data.id));
    return { ok: true as const };
  });

const idSchema = z.object({ id: z.number().int().positive() });

const setNarratorsSchema = z.object({
  segmentIds: z.array(z.number().int().positive()).min(1).max(5000),
  narratorId: z.number().int().positive().nullable(),
});

export const setSegmentNarrators = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof setNarratorsSchema>) => setNarratorsSchema.parse(data))
  .handler(async ({ data }): Promise<{ updated: number }> => {
    // Changing the narrator changes the voice that drives TTS, so mark every
    // affected segment stale — mirrors the ttsChanged branch in updateSegment.
    const result = await db
      .update(segments)
      .set({
        narratorId: data.narratorId,
        isStale: true,
        updatedAt: new Date(),
      })
      .where(inArray(segments.id, data.segmentIds))
      .returning({ id: segments.id });
    return { updated: result.length };
  });

export const markSegmentStale = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof idSchema>) => idSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await db
      .update(segments)
      .set({ isStale: true, updatedAt: new Date() })
      .where(eq(segments.id, data.id));
    return { ok: true as const };
  });

const setGenerationSchema = z.object({
  segmentId: z.number().int().positive(),
  generationId: z.number().int().positive(),
});

export const setSegmentGeneration = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof setGenerationSchema>) => setGenerationSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const [gen] = await db
      .select({ id: ttsGenerations.id, segmentId: ttsGenerations.segmentId })
      .from(ttsGenerations)
      .where(eq(ttsGenerations.id, data.generationId));
    if (!gen || gen.segmentId !== data.segmentId) {
      throw new Error(t("Audio record does not belong to this segment"));
    }
    await db
      .update(segments)
      .set({
        generationId: data.generationId,
        isStale: false,
        updatedAt: new Date(),
      })
      .where(eq(segments.id, data.segmentId));
    return { ok: true as const };
  });

export type SegmentGeneration = {
  id: number;
  editedFromGenerationId: number | null;
  voiceKey: string | null;
  text: string | null;
  createdAt: Date;
  file: {
    id: number;
    fileMime: string;
    fileSize: number;
    durationMs: number;
  };
};

const segmentIdSchema = z.object({
  segmentId: z.number().int().positive(),
});

export const listSegmentGenerations = createServerFn({ method: "GET" })
  .validator((data: z.input<typeof segmentIdSchema>) => segmentIdSchema.parse(data))
  .handler(async ({ data }): Promise<SegmentGeneration[]> => {
    const rows = await db
      .select({
        id: ttsGenerations.id,
        editedFromGenerationId: ttsGenerations.editedFromGenerationId,
        payload: ttsGenerations.payload,
        createdAt: ttsGenerations.createdAt,
        fileId: files.id,
        fileMime: files.fileMime,
        fileSize: files.fileSize,
        durationMs: files.durationMs,
      })
      .from(ttsGenerations)
      .innerJoin(files, eq(files.id, ttsGenerations.fileId))
      .where(eq(ttsGenerations.segmentId, data.segmentId))
      .orderBy(desc(ttsGenerations.createdAt), desc(ttsGenerations.id));
    return rows.map((r) => ({
      id: r.id,
      voiceKey: r.payload?.voice ?? null,
      editedFromGenerationId: r.editedFromGenerationId,
      text: r.payload?.input ?? null,
      createdAt: r.createdAt,
      file: {
        id: r.fileId,
        fileMime: r.fileMime,
        fileSize: r.fileSize,
        durationMs: r.durationMs ?? 0,
      },
    }));
  });

const enqueueSchema = z.object({
  segmentIds: z.array(z.number().int().positive()).min(1).max(5000),
});

export const enqueueSegments = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof enqueueSchema>) => enqueueSchema.parse(data))
  .handler(async ({ data }): Promise<{ enqueued: number; skipped: number; total: number }> => {
    const { addTTSJobsBulk, getActiveJobSegmentIds } = await import("@/mq/generate-segment.server");

    const alreadyQueued = await getActiveJobSegmentIds();
    const seen = new Set<number>();
    const toAdd: number[] = [];
    for (const id of data.segmentIds) {
      if (seen.has(id) || alreadyQueued.has(id)) continue;
      seen.add(id);
      toAdd.push(id);
    }

    const enqueued = await addTTSJobsBulk(toAdd);

    return {
      enqueued,
      skipped: data.segmentIds.length - enqueued,
      total: data.segmentIds.length,
    };
  });

const syncSegmentsSchema = z.object({
  chapterId: z.number().int().positive(),
  drafts: z.array(draftSegmentSchema).max(5000),
});

export type SyncSegmentsResult = {
  preserved: number;
  removed: number;
  inserted: number;
  reordered: number;
  narratorsCreated: number;
};

export const syncChapterSegments = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof syncSegmentsSchema>) => syncSegmentsSchema.parse(data))
  .handler(async ({ data }): Promise<SyncSegmentsResult> => {
    const [chapter] = await db
      .select({ id: chapters.id, projectId: chapters.projectId })
      .from(chapters)
      .where(and(eq(chapters.id, data.chapterId), isNull(chapters.deletedAt)));
    if (!chapter) throw new Error(t("Chapter not found"));

    const now = new Date();
    type Preserved = { id: number; sortOrder: number };
    type Inserted = {
      sortOrder: number;
      narratorId: number | null;
      text: string;
    };

    // Captured inside the transaction; consumed after commit to cancel any
    // queued TTS jobs for segments we just hard-deleted.
    let removedIds: number[] = [];

    const result = db.transaction((tx) => {
      const narratorRows = tx
        .select({ id: narrators.id, name: narrators.name })
        .from(narrators)
        .where(eq(narrators.projectId, chapter.projectId))
        .all();
      const narratorIdByName = new Map<string, number>();
      for (const n of narratorRows) narratorIdByName.set(n.name, n.id);

      // Auto-create narrators referenced in the script but not yet in the
      // project. New narrators have no voice / settings; users tweak them
      // later in the narrators panel.
      const missingNames: string[] = [];
      const missingSet = new Set<string>();
      for (const draft of data.drafts) {
        if (!draft.narratorName) continue;
        if (narratorIdByName.has(draft.narratorName)) continue;
        if (missingSet.has(draft.narratorName)) continue;
        missingSet.add(draft.narratorName);
        missingNames.push(draft.narratorName);
      }
      for (const name of missingNames) {
        const created = tx
          .insert(narrators)
          .values({
            projectId: chapter.projectId,
            name,
            voiceId: null,
            voiceSettings: null,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: narrators.id })
          .get();
        narratorIdByName.set(name, created.id);
      }

      const currentRows = tx
        .select({
          id: segments.id,
          narratorId: segments.narratorId,
          content: segments.content,
        })
        .from(segments)
        .where(eq(segments.chapterId, data.chapterId))
        .orderBy(asc(segments.sortOrder), asc(segments.id))
        .all();

      const keyOf = (narratorId: number | null, text: string): string =>
        `${narratorId ?? "<null>"}${text.trim()}`;

      const queueByKey = new Map<string, number[]>();
      for (let i = 0; i < currentRows.length; i++) {
        const c = currentRows[i];
        const k = keyOf(c.narratorId, c.content ?? "");
        const arr = queueByKey.get(k);
        if (arr) arr.push(i);
        else queueByKey.set(k, [i]);
      }

      const preserved: Preserved[] = [];
      const inserted: Inserted[] = [];
      const matched = new Array<boolean>(currentRows.length).fill(false);

      for (let sortOrder = 0; sortOrder < data.drafts.length; sortOrder++) {
        const d = data.drafts[sortOrder];
        const narratorId = d.narratorName ? (narratorIdByName.get(d.narratorName) ?? null) : null;
        const k = keyOf(narratorId, d.text);
        const q = queueByKey.get(k);
        if (q && q.length > 0) {
          const idx = q.shift() as number;
          matched[idx] = true;
          preserved.push({ id: currentRows[idx].id, sortOrder });
        } else {
          inserted.push({ sortOrder, narratorId, text: d.text });
        }
      }

      const removed: number[] = [];
      for (let i = 0; i < currentRows.length; i++) {
        if (!matched[i]) removed.push(currentRows[i].id);
      }

      if (removed.length > 0) {
        tx.delete(segments).where(inArray(segments.id, removed)).run();
      }
      removedIds = removed;
      // Two-phase reorder: shift preserved sortOrder to a non-conflicting
      // range first, then to the final value, so intermediate updates don't
      // collide with rows that haven't been moved yet.
      const SHIFT = 1_000_000;
      for (const p of preserved) {
        tx.update(segments)
          .set({ sortOrder: p.sortOrder + SHIFT, updatedAt: now })
          .where(eq(segments.id, p.id))
          .run();
      }
      for (const p of preserved) {
        tx.update(segments)
          .set({ sortOrder: p.sortOrder, updatedAt: now })
          .where(eq(segments.id, p.id))
          .run();
      }
      for (const ins of inserted) {
        tx.insert(segments)
          .values({
            chapterId: data.chapterId,
            narratorId: ins.narratorId,
            voiceId: null,
            generationId: null,
            content: ins.text,
            voiceSettings: null,
            sortOrder: ins.sortOrder,
            isStale: true,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      return {
        preserved: preserved.length,
        removed: removed.length,
        inserted: inserted.length,
        reordered: preserved.length,
        narratorsCreated: missingNames.length,
      };
    });

    if (removedIds.length > 0) {
      const { cancelTTSJobsBySegmentIds } = await import("@/mq/generate-segment.server");
      await cancelTTSJobsBySegmentIds(removedIds);
    }

    return result;
  });

export const getSegmentChapter = createServerFn({ method: "GET" })
  .validator((data: z.input<typeof segmentIdSchema>) => segmentIdSchema.parse(data))
  .handler(async ({ data }): Promise<{ chapterId: number } | null> => {
    const [row] = await db
      .select({ chapterId: segments.chapterId })
      .from(segments)
      .innerJoin(chapters, eq(chapters.id, segments.chapterId))
      .where(and(eq(segments.id, data.segmentId), isNull(chapters.deletedAt)));
    return row ?? null;
  });

const generationUrlSchema = z.object({
  id: z.number().int().positive(),
  download: z.boolean().optional(),
});

export const getSegmentGenerationUrl = createServerFn({ method: "GET" })
  .validator((data: z.input<typeof generationUrlSchema>) => generationUrlSchema.parse(data))
  .handler(
    async ({
      data,
    }): Promise<{
      url: string;
      fileName: string;
    }> => {
      const [row] = await db
        .select({
          path: files.path,
          fileMime: files.fileMime,
          fileName: files.fileName,
        })
        .from(ttsGenerations)
        .innerJoin(files, eq(files.id, ttsGenerations.fileId))
        .where(eq(ttsGenerations.id, data.id));
      if (!row) throw new Error(t("Audio not found"));
      const { fileDownloadUrl } = await import("@/lib/files.server");
      const url = await fileDownloadUrl(row, {
        asAttachment: data.download,
      });
      return { url, fileName: row.fileName };
    },
  );

export type SegmentGenerationInfo = {
  id: number;
  serviceUrl: string | null;
  payload: TTSPayload | null;
  createdAt: Date;
};

export const getSegmentGenerationInfo = createServerFn({ method: "GET" })
  .validator((data: z.input<typeof idSchema>) => idSchema.parse(data))

  .handler(async ({ data }): Promise<SegmentGenerationInfo> => {
    const [row] = await db
      .select({
        id: ttsGenerations.id,
        serviceUrl: ttsGenerations.serviceUrl,
        payload: ttsGenerations.payload,
        createdAt: ttsGenerations.createdAt,
      })
      .from(ttsGenerations)
      .where(eq(ttsGenerations.id, data.id));
    if (!row) throw new Error(t("Generation record not found"));
    return row;
  });

const generationBatchSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
});

export type SegmentGenerationDownloadEntry = {
  id: number;
  url: string;
  fileName: string;
  sortOrder: number;
};

export const getSegmentGenerationUrlsBatch = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof generationBatchSchema>) => generationBatchSchema.parse(data))
  .handler(async ({ data }): Promise<SegmentGenerationDownloadEntry[]> => {
    const rows = await db
      .select({
        id: ttsGenerations.id,
        path: files.path,
        fileMime: files.fileMime,
        fileName: files.fileName,
        sortOrder: segments.sortOrder,
      })
      .from(ttsGenerations)
      .innerJoin(files, eq(files.id, ttsGenerations.fileId))
      .leftJoin(segments, eq(segments.id, ttsGenerations.segmentId))
      .where(inArray(ttsGenerations.id, data.ids));
    if (rows.length === 0) return [];
    rows.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const { fileDownloadUrl } = await import("@/lib/files.server");
    // Sign in parallel; URLs are good for ~10 minutes which is plenty for
    // a browser-side zip build of a typical batch.
    return await Promise.all(
      rows.map(async (row) => {
        const url = await fileDownloadUrl(row);
        return {
          id: row.id,
          url,
          fileName: row.fileName,
          sortOrder: row.sortOrder ?? 0,
        };
      }),
    );
  });
