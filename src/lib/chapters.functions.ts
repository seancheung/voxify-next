import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { chapters, files, projects, segments, ttsGenerations } from "@/db/schema";
import { t } from "@/i18n";
import type { ProjectSettings } from "@/types/project";

export type ProjectDetail = {
  id: number;
  name: string;
  description: string | null;
  author: string | null;
  coverFileId: number | null;
  voiceId: number | null;
  llmModelId: number | null;
  promptId: number | null;
  settings: ProjectSettings | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ChapterListItem = {
  id: number;
  projectId: number;
  name: string;
  description: string | null;
  sortOrder: number;
  /** Total segments under this chapter. Used to drive the completion
   * indicator in the chapter list (complete = segmentCount > 0 and every
   * segment has a generationId). */
  segmentCount: number;
  /** Segments that already have a generationId attached. */
  generatedCount: number;
  /** Segments whose content changed since their last generation
   * (isStale=true). When the chapter is otherwise complete, a non-zero
   * staleCount switches the chapter list indicator from check to info. */
  staleCount: number;
  createdAt: Date;
  updatedAt: Date;
};

const projectIdSchema = z.object({ id: z.number().int().positive() });

export const getProject = createServerFn({ method: "GET" })
  .validator((data: z.input<typeof projectIdSchema>) => projectIdSchema.parse(data))
  .handler(async ({ data }): Promise<ProjectDetail | null> => {
    const [row] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, data.id), isNull(projects.deletedAt)));
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      author: row.author,
      coverFileId: row.coverFileId,
      voiceId: row.voiceId,
      llmModelId: row.llmModelId,
      promptId: row.promptId,
      settings: row.settings,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });

export const touchProjectLastOpened = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof projectIdSchema>) => projectIdSchema.parse(data))
  .handler(async ({ data }) => {
    const now = new Date();
    await db
      .update(projects)
      .set({ lastOpenedAt: now })
      .where(and(eq(projects.id, data.id), isNull(projects.deletedAt)));
    return { ok: true as const };
  });

const listSchema = z.object({ projectId: z.number().int().positive() });

export const listChapters = createServerFn({ method: "GET" })
  .validator((data: z.input<typeof listSchema>) => listSchema.parse(data))
  .handler(async ({ data }): Promise<ChapterListItem[]> => {
    // leftJoin + groupBy so empty chapters still appear (with counts of 0).
    // COUNT(column) ignores NULLs, so COUNT(generationId) is naturally the
    // number of generated segments and the join's NULL row falls out.
    const rows = await db
      .select({
        id: chapters.id,
        projectId: chapters.projectId,
        name: chapters.name,
        description: chapters.description,
        sortOrder: chapters.sortOrder,
        createdAt: chapters.createdAt,
        updatedAt: chapters.updatedAt,
        segmentCount: sql<number>`COUNT(${segments.id})`.mapWith(Number),
        generatedCount: sql<number>`COUNT(${segments.generationId})`.mapWith(Number),
        staleCount: sql<number>`COUNT(${segments.id}) FILTER (WHERE ${segments.isStale})`.mapWith(
          Number,
        ),
      })
      .from(chapters)
      .leftJoin(segments, eq(segments.chapterId, chapters.id))
      .where(and(eq(chapters.projectId, data.projectId), isNull(chapters.deletedAt)))
      .groupBy(chapters.id)
      .orderBy(asc(chapters.sortOrder), asc(chapters.id));
    return rows;
  });

export const createChapterSchema = z.object({
  projectId: z.number().int().positive(),
  name: z
    .string()
    .trim()
    .min(1, { error: () => t("Enter a chapter name") })
    .max(120),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const createChapter = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof createChapterSchema>) => createChapterSchema.parse(data))
  .handler(async ({ data }): Promise<ChapterListItem> => {
    const now = new Date();
    const [{ next }] = await db
      .select({
        next: sql<number>`COALESCE(MAX(${chapters.sortOrder}), 0) + 1`.mapWith(Number),
      })
      .from(chapters)
      .where(and(eq(chapters.projectId, data.projectId), isNull(chapters.deletedAt)));
    const [created] = await db
      .insert(chapters)
      .values({
        projectId: data.projectId,
        name: data.name,
        description: data.description ? data.description : null,
        content: "",
        sortOrder: next,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return {
      id: created.id,
      projectId: created.projectId,
      name: created.name,
      description: created.description,
      sortOrder: created.sortOrder,
      segmentCount: 0,
      generatedCount: 0,
      staleCount: 0,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  });

export const updateChapterSchema = z.object({
  id: z.number().int().positive(),
  name: z
    .string()
    .trim()
    .min(1, { error: () => t("Enter a chapter name") })
    .max(120),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const updateChapter = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof updateChapterSchema>) => updateChapterSchema.parse(data))
  .handler(async ({ data }) => {
    await db
      .update(chapters)
      .set({
        name: data.name,
        description: data.description ? data.description : null,
        updatedAt: new Date(),
      })
      .where(and(eq(chapters.id, data.id), isNull(chapters.deletedAt)));
    return { ok: true as const };
  });

const idSchema = z.object({ id: z.number().int().positive() });

export const deleteChapter = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof idSchema>) => idSchema.parse(data))
  .handler(async ({ data }) => {
    const now = new Date();
    // Snapshot the chapter's segment ids first so we can cancel their queued
    // TTS jobs after the soft-delete commits — otherwise the worker would
    // keep generating audio for a chapter the user just threw away.
    const segmentRows = await db
      .select({ id: segments.id })
      .from(segments)
      .where(eq(segments.chapterId, data.id));
    await db
      .update(chapters)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(chapters.id, data.id), isNull(chapters.deletedAt)));
    if (segmentRows.length > 0) {
      const { cancelTTSJobsBySegmentIds } = await import("@/mq/generate-segment.server");
      await cancelTTSJobsBySegmentIds(segmentRows.map((r) => r.id));
    }
    return { ok: true as const };
  });

export const duplicateChapter = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof idSchema>) => idSchema.parse(data))
  .handler(async ({ data }): Promise<ChapterListItem> => {
    const now = new Date();
    return db.transaction((tx) => {
      const [src] = tx
        .select()
        .from(chapters)
        .where(and(eq(chapters.id, data.id), isNull(chapters.deletedAt)))
        .all();
      if (!src) throw new Error(t("Chapter not found"));

      const [{ next }] = tx
        .select({
          next: sql<number>`COALESCE(MAX(${chapters.sortOrder}), 0) + 1`.mapWith(Number),
        })
        .from(chapters)
        .where(and(eq(chapters.projectId, src.projectId), isNull(chapters.deletedAt)))
        .all();

      const [copied] = tx
        .insert(chapters)
        .values({
          projectId: src.projectId,
          name: t("{0} (copy)", src.name),
          description: src.description,
          content: src.content,
          voiceId: src.voiceId,
          sortOrder: next,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .all();

      const srcSegments = tx
        .select()
        .from(segments)
        .where(eq(segments.chapterId, src.id))
        .orderBy(asc(segments.sortOrder))
        .all();
      for (const s of srcSegments) {
        tx.insert(segments)
          .values({
            chapterId: copied.id,
            narratorId: s.narratorId,
            voiceId: s.voiceId,
            generationId: null,
            content: s.content,
            voiceSettings: s.voiceSettings,
            sortOrder: s.sortOrder,
            isStale: true,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      return {
        id: copied.id,
        projectId: copied.projectId,
        name: copied.name,
        description: copied.description,
        sortOrder: copied.sortOrder,
        // Segments are cloned with generationId reset, so the copy starts
        // at zero generated segments regardless of how complete the source was.
        segmentCount: srcSegments.length,
        generatedCount: 0,
        // Cloned segments are inserted with isStale=true (see the values
        // mapper above), so every segment in the copy starts stale.
        staleCount: srcSegments.length,
        createdAt: copied.createdAt,
        updatedAt: copied.updatedAt,
      };
    });
  });

const reorderSchema = z.object({
  projectId: z.number().int().positive(),
  ids: z.array(z.number().int().positive()).min(1),
});

export const reorderChapters = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof reorderSchema>) => reorderSchema.parse(data))
  .handler(async ({ data }) => {
    const now = new Date();
    db.transaction((tx) => {
      const existing = tx
        .select({ id: chapters.id })
        .from(chapters)
        .where(
          and(
            eq(chapters.projectId, data.projectId),
            isNull(chapters.deletedAt),
            inArray(chapters.id, data.ids),
          ),
        )
        .all();
      const valid = new Set(existing.map((r) => r.id));
      for (let i = 0; i < data.ids.length; i++) {
        const id = data.ids[i];
        if (!valid.has(id)) continue;
        tx.update(chapters)
          .set({ sortOrder: i + 1, updatedAt: now })
          .where(eq(chapters.id, id))
          .run();
      }
    });
    return { ok: true as const };
  });

export type DeletedChapterListItem = {
  id: number;
  name: string;
  deletedAt: Date;
  segmentCount: number;
  generationCount: number;
  fileCount: number;
  fileSize: number;
};

const projectScopeSchema = z.object({
  projectId: z.number().int().positive(),
});

export const listDeletedChapters = createServerFn({ method: "GET" })
  .validator((data: z.input<typeof projectScopeSchema>) => projectScopeSchema.parse(data))
  .handler(async ({ data }): Promise<DeletedChapterListItem[]> => {
    const rows = await db
      .select({
        id: chapters.id,
        name: chapters.name,
        deletedAt: chapters.deletedAt,
      })
      .from(chapters)
      .where(and(eq(chapters.projectId, data.projectId), isNotNull(chapters.deletedAt)))
      .orderBy(desc(chapters.deletedAt), desc(chapters.id));
    if (rows.length === 0) return [];

    const chapterIds = rows.map((r) => r.id);

    const segCountRows = await db
      .select({
        chapterId: segments.chapterId,
        cnt: sql<number>`COUNT(*)`,
      })
      .from(segments)
      .where(inArray(segments.chapterId, chapterIds))
      .groupBy(segments.chapterId);
    const segmentCountByChapter = new Map<number, number>();
    for (const r of segCountRows) {
      segmentCountByChapter.set(r.chapterId, r.cnt);
    }

    // Pull tts-generations linked through this chapter's segments. The join
    // restricts us to live segment links — orphan generations (segmentId
    // already null) are unrelated to the chapter and don't count here.
    const genRows = await db
      .select({
        chapterId: segments.chapterId,
        fileId: ttsGenerations.fileId,
      })
      .from(ttsGenerations)
      .innerJoin(segments, eq(ttsGenerations.segmentId, segments.id))
      .where(inArray(segments.chapterId, chapterIds));

    const fileIdsByChapter = new Map<number, Set<number>>();
    const generationCountByChapter = new Map<number, number>();
    for (const id of chapterIds) {
      fileIdsByChapter.set(id, new Set());
      generationCountByChapter.set(id, 0);
    }
    for (const r of genRows) {
      fileIdsByChapter.get(r.chapterId)?.add(r.fileId);
      generationCountByChapter.set(
        r.chapterId,
        (generationCountByChapter.get(r.chapterId) ?? 0) + 1,
      );
    }

    const allFileIds = Array.from(
      new Set(Array.from(fileIdsByChapter.values()).flatMap((s) => Array.from(s))),
    );
    const fileSizeById = new Map<number, number>();
    if (allFileIds.length > 0) {
      const fileRows = await db
        .select({ id: files.id, fileSize: files.fileSize })
        .from(files)
        .where(inArray(files.id, allFileIds));
      for (const r of fileRows) fileSizeById.set(r.id, r.fileSize);
    }

    return rows.map((r) => {
      const fileIds = fileIdsByChapter.get(r.id) ?? new Set<number>();
      let size = 0;
      for (const id of fileIds) size += fileSizeById.get(id) ?? 0;
      return {
        id: r.id,
        name: r.name,
        // deletedAt is non-null due to the WHERE filter above; the inferred
        // type is still nullable.
        deletedAt: r.deletedAt!,
        segmentCount: segmentCountByChapter.get(r.id) ?? 0,
        generationCount: generationCountByChapter.get(r.id) ?? 0,
        fileCount: fileIds.size,
        fileSize: size,
      };
    });
  });

export const restoreChapter = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof idSchema>) => idSchema.parse(data))
  .handler(async ({ data }) => {
    const now = new Date();
    await db
      .update(chapters)
      .set({ deletedAt: null, updatedAt: now })
      .where(and(eq(chapters.id, data.id), isNotNull(chapters.deletedAt)));
    return { ok: true as const };
  });

export const purgeChapter = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof idSchema>) => idSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true; deletedFiles: number }> => {
    const [chapter] = await db
      .select({ id: chapters.id })
      .from(chapters)
      .where(and(eq(chapters.id, data.id), isNotNull(chapters.deletedAt)));
    if (!chapter) throw new Error(t("Chapter not found in the recycle bin"));

    const segmentRows = await db
      .select({ id: segments.id })
      .from(segments)
      .where(eq(segments.chapterId, chapter.id));
    const segmentIds = segmentRows.map((r) => r.id);

    let generationIds: number[] = [];
    let fileIds: number[] = [];
    if (segmentIds.length > 0) {
      const genRows = await db
        .select({ id: ttsGenerations.id, fileId: ttsGenerations.fileId })
        .from(ttsGenerations)
        .where(inArray(ttsGenerations.segmentId, segmentIds));
      generationIds = genRows.map((r) => r.id);
      fileIds = Array.from(new Set(genRows.map((r) => r.fileId)));
    }

    const { deleteFilesWithObjects } = await import("@/lib/files.server");
    db.transaction((tx) => {
      if (generationIds.length > 0) {
        tx.delete(ttsGenerations).where(inArray(ttsGenerations.id, generationIds)).run();
      }
      tx.delete(chapters).where(eq(chapters.id, chapter.id)).run();
      if (fileIds.length > 0) {
        deleteFilesWithObjects(fileIds, tx);
      }
    });

    return { ok: true as const, deletedFiles: fileIds.length };
  });
