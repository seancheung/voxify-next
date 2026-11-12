import { createServerFn } from "@tanstack/react-start";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  or,
  type SQL,
  sql,
  like as sqlLike,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  chapters,
  files,
  narrators,
  projectExports,
  projects,
  segments,
  ttsGenerations,
} from "@/db/schema";
import { t } from "@/i18n";
import type { ProjectDetail } from "@/lib/chapters.functions";
import type { ProjectSettings } from "@/types/project";
import type { CustomArgs, VoiceSettings } from "@/types/tts";

export type ProjectListItem = {
  id: number;
  name: string;
  description: string | null;
  author: string | null;
  coverFileId: number | null;
  settings: ProjectSettings | null;
  lastOpenedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  chapterCount: number;
  segmentCount: number;
  completedSegmentCount: number;
};

const listSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(24),
  sort: z.enum(["lastOpenedAt", "createdAt", "name"]).default("lastOpenedAt"),
  search: z.string().trim().optional(),
  status: z.enum(["all", "completed", "incomplete"]).default("all"),
});

export type ListProjectsInput = z.input<typeof listSchema>;
export type ListProjectsResult = {
  items: ProjectListItem[];
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

export const listProjects = createServerFn({ method: "GET" })
  .validator((data: z.input<typeof listSchema>) => listSchema.parse(data))
  .handler(async ({ data }): Promise<ListProjectsResult> => {
    const { cursor, limit, sort, search, status } = data;

    const where: SQL[] = [isNull(projects.deletedAt)];

    if (search) {
      const like = `%${search}%`;
      const term = or(sqlLike(projects.name, like), sqlLike(projects.author, like));
      if (term) where.push(term);
    }

    const parsedCursor = cursor ? decodeCursor(cursor) : null;
    if (parsedCursor) {
      const { v, id } = parsedCursor;
      if (sort === "name") {
        where.push(sql`(${projects.name}, ${projects.id}) > (${v}, ${id})`);
      } else if (sort === "createdAt") {
        where.push(
          sql`(${projects.createdAt}, ${projects.id}) < (${new Date(v).getTime()}, ${id})`,
        );
      } else {
        where.push(
          sql`(COALESCE(${projects.lastOpenedAt}, ${projects.createdAt}), ${projects.id}) < (${new Date(v).getTime()}, ${id})`,
        );
      }
    }

    const havingExpr =
      status === "completed"
        ? sql`COUNT(${segments.id}) > 0 AND COUNT(${segments.id}) = COUNT(${segments.generationId})`
        : status === "incomplete"
          ? sql`COUNT(${segments.id}) = 0 OR COUNT(${segments.id}) > COUNT(${segments.generationId})`
          : sql`true`;

    const orderBy =
      sort === "name"
        ? [asc(projects.name), asc(projects.id)]
        : sort === "createdAt"
          ? [desc(projects.createdAt), desc(projects.id)]
          : [
              sql`COALESCE(${projects.lastOpenedAt}, ${projects.createdAt}) DESC`,
              desc(projects.id),
            ];

    const rows = await db
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        author: projects.author,
        coverFileId: projects.coverFileId,
        settings: projects.settings,
        lastOpenedAt: projects.lastOpenedAt,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
        chapterCount: sql<number>`COUNT(DISTINCT ${chapters.id})`.mapWith(Number),
        segmentCount: sql<number>`COUNT(${segments.id})`.mapWith(Number),
        completedSegmentCount: sql<number>`COUNT(${segments.generationId})`.mapWith(Number),
      })
      .from(projects)
      .leftJoin(chapters, and(eq(chapters.projectId, projects.id), isNull(chapters.deletedAt)))
      .leftJoin(segments, eq(segments.chapterId, chapters.id))
      .where(and(...where))
      .groupBy(projects.id)
      .having(havingExpr)
      .orderBy(...orderBy)
      .limit(limit + 1);

    let nextCursor: string | null = null;
    if (rows.length > limit) {
      const last = rows[limit - 1];
      const cursorValue =
        sort === "name"
          ? last.name
          : sort === "createdAt"
            ? last.createdAt
            : (last.lastOpenedAt ?? last.createdAt);
      nextCursor = encodeCursor(cursorValue, last.id);
      rows.pop();
    }

    return { items: rows, nextCursor };
  });

export const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: () => t("Enter a project name") })
    .max(120),
  author: z.string().trim().max(120).optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  locale: z.string().trim().optional().or(z.literal("")),
  voiceId: z.number().int().nullable().optional(),
});

export const createProject = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof createProjectSchema>) => createProjectSchema.parse(data))
  .handler(async ({ data }) => {
    const now = new Date();
    const settings: ProjectSettings | null = data.locale ? { locale: data.locale } : null;
    const [created] = await db
      .insert(projects)
      .values({
        name: data.name,
        author: data.author ? data.author : null,
        description: data.description ? data.description : null,
        voiceId: data.voiceId ?? null,
        settings,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return created;
  });

export const importProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: () => t("Enter a project name") })
    .max(120),
  author: z.string().trim().max(120).optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  locale: z.string().trim().optional().or(z.literal("")),
  chapters: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        segments: z.array(z.string().trim().min(1).max(20000)).min(1).max(5000),
      }),
    )
    .min(1, { error: () => t("Import at least one chapter") })
    .max(2000),
});

export type ImportProjectInput = z.input<typeof importProjectSchema>;

export const importProject = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof importProjectSchema>) => importProjectSchema.parse(data))
  .handler(
    async ({
      data,
    }): Promise<{
      projectId: number;
      chaptersCreated: number;
      segmentsCreated: number;
    }> => {
      const now = new Date();
      const settings: ProjectSettings | null = data.locale ? { locale: data.locale } : null;

      return db.transaction((tx) => {
        const [created] = tx
          .insert(projects)
          .values({
            name: data.name,
            author: data.author ? data.author : null,
            description: data.description ? data.description : null,
            settings,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: projects.id })
          .all();

        const chapterValues = data.chapters.map((c, i) => ({
          projectId: created.id,
          name: c.name,
          description: null,
          content: "",
          sortOrder: i + 1,
          createdAt: now,
          updatedAt: now,
        }));
        const insertedChapters = tx
          .insert(chapters)
          .values(chapterValues)
          .returning({ id: chapters.id })
          .all();

        let segmentsCreated = 0;
        const allSegments = data.chapters.flatMap((c, i) =>
          c.segments.map((text, sortOrder) => ({
            chapterId: insertedChapters[i].id,
            narratorId: null,
            voiceId: null,
            generationId: null,
            content: text,
            voiceSettings: null,
            sortOrder,
            isStale: true,
            createdAt: now,
            updatedAt: now,
          })),
        );
        if (allSegments.length > 0) {
          const CHUNK = 500;
          for (let i = 0; i < allSegments.length; i += CHUNK) {
            const slice = allSegments.slice(i, i + CHUNK);
            tx.insert(segments).values(slice).run();
            segmentsCreated += slice.length;
          }
        }

        return {
          projectId: created.id,
          chaptersCreated: insertedChapters.length,
          segmentsCreated,
        };
      });
    },
  );

const idSchema = z.object({ id: z.number().int().positive() });

export const deleteProject = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof idSchema>) => idSchema.parse(data))
  .handler(async ({ data }) => {
    const now = new Date();
    // Collect every segment id under this project so we can cancel their
    // queued TTS jobs after the soft-delete commits — same reasoning as
    // deleteChapter, just one level up the hierarchy.
    const segmentRows = await db
      .select({ id: segments.id })
      .from(segments)
      .innerJoin(chapters, eq(segments.chapterId, chapters.id))
      .where(eq(chapters.projectId, data.id));
    await db
      .update(projects)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(projects.id, data.id), isNull(projects.deletedAt)));
    if (segmentRows.length > 0) {
      const { cancelTTSJobsBySegmentIds } = await import("@/mq/generate-segment.server");
      await cancelTTSJobsBySegmentIds(segmentRows.map((r) => r.id));
    }
    return { ok: true as const };
  });

export const restoreProject = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof idSchema>) => idSchema.parse(data))
  .handler(async ({ data }) => {
    const now = new Date();
    await db
      .update(projects)
      .set({ deletedAt: null, updatedAt: now })
      .where(and(eq(projects.id, data.id), isNotNull(projects.deletedAt)));
    return { ok: true as const };
  });

export const duplicateProject = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof idSchema>) => idSchema.parse(data))
  .handler(async ({ data }) => {
    const now = new Date();
    return db.transaction((tx) => {
      const [src] = tx
        .select()
        .from(projects)
        .where(and(eq(projects.id, data.id), isNull(projects.deletedAt)))
        .all();
      if (!src) throw new Error(t("Project not found"));

      const [copied] = tx
        .insert(projects)
        .values({
          name: t("{0} (copy)", src.name),
          description: src.description,
          author: src.author,
          coverFileId: null,
          voiceId: src.voiceId,
          llmModelId: src.llmModelId,
          promptId: src.promptId,
          settings: src.settings,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .all();

      const srcNarrators = tx.select().from(narrators).where(eq(narrators.projectId, src.id)).all();
      const narratorIdMap = new Map<number, number>();
      for (const n of srcNarrators) {
        const copy = tx
          .insert(narrators)
          .values({
            projectId: copied.id,
            name: n.name,
            voiceId: n.voiceId,
            voiceSettings: n.voiceSettings,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: narrators.id })
          .get();
        narratorIdMap.set(n.id, copy.id);
      }

      // Chapters: clone non-deleted ones, preserving sortOrder. Mapping built
      // the same way as narrators above.
      const srcChapters = tx
        .select()
        .from(chapters)
        .where(and(eq(chapters.projectId, src.id), isNull(chapters.deletedAt)))
        .orderBy(asc(chapters.sortOrder))
        .all();
      const chapterIdMap = new Map<number, number>();
      for (const c of srcChapters) {
        const copy = tx
          .insert(chapters)
          .values({
            projectId: copied.id,
            name: c.name,
            description: c.description,
            content: c.content,
            voiceId: c.voiceId,
            sortOrder: c.sortOrder,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: chapters.id })
          .get();
        chapterIdMap.set(c.id, copy.id);
      }

      // Segments: clone under the cloned chapters with re-mapped narrator ids.
      // Reset generation linkage and mark stale so the copy starts in the
      // "needs generation" state — tts-generations are not copied.
      const srcChapterIds = srcChapters.map((c) => c.id);
      if (srcChapterIds.length > 0) {
        const srcSegments = tx
          .select()
          .from(segments)
          .where(inArray(segments.chapterId, srcChapterIds))
          .all();
        for (const s of srcSegments) {
          tx.insert(segments)
            .values({
              chapterId: chapterIdMap.get(s.chapterId)!,
              narratorId: s.narratorId != null ? (narratorIdMap.get(s.narratorId) ?? null) : null,
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
      }

      return copied;
    });
  });

export const updateProjectSchema = z.object({
  id: z.number().int().positive(),
  name: z
    .string()
    .trim()
    .min(1, { error: () => t("Enter a project name") })
    .max(120),
  description: z.string().trim().max(2000).nullable(),
  author: z.string().trim().max(120).nullable(),
  coverFileId: z.number().int().positive().nullable(),
  locale: z.string().trim().max(40).nullable(),
  voiceId: z.number().int().positive().nullable(),
  llmModelId: z.number().int().positive().nullable(),
  promptId: z.number().int().positive().nullable(),
  gap: z.number().int().min(0).max(60_000).nullable(),
  chapterGap: z.number().int().min(0).max(600_000).nullable(),
});

export const updateProject = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof updateProjectSchema>) => updateProjectSchema.parse(data))
  .handler(async ({ data }): Promise<ProjectDetail> => {
    const [current] = await db
      .select({
        coverFileId: projects.coverFileId,
        settings: projects.settings,
      })
      .from(projects)
      .where(and(eq(projects.id, data.id), isNull(projects.deletedAt)));
    if (!current) throw new Error(t("Project not found"));

    const prevVoiceSettings = current.settings?.voiceSettings;
    const settings: ProjectSettings | null =
      data.locale || data.gap != null || data.chapterGap != null || prevVoiceSettings
        ? {
            ...(data.locale ? { locale: data.locale } : {}),
            ...(data.gap != null ? { gap: data.gap } : {}),
            ...(data.chapterGap != null ? { chapterGap: data.chapterGap } : {}),
            ...(prevVoiceSettings ? { voiceSettings: prevVoiceSettings } : {}),
          }
        : null;

    const now = new Date();
    const [saved] = await db
      .update(projects)
      .set({
        name: data.name,
        description: data.description?.trim() ? data.description.trim() : null,
        author: data.author?.trim() ? data.author.trim() : null,
        coverFileId: data.coverFileId,
        voiceId: data.voiceId,
        llmModelId: data.llmModelId,
        promptId: data.promptId,
        settings,
        updatedAt: now,
      })
      .where(and(eq(projects.id, data.id), isNull(projects.deletedAt)))
      .returning();
    if (!saved) throw new Error(t("Project not found"));

    // If the user cleared / replaced the cover, drop the old file row.
    // Replacement via the upload flow handles its own cleanup, but the
    // settings form can also null this out directly.
    if (current.coverFileId && current.coverFileId !== data.coverFileId) {
      const { deleteFileWithObject } = await import("@/lib/files.server");
      try {
        deleteFileWithObject(current.coverFileId);
      } catch (err) {
        console.warn(t("Failed to delete old cover:"), err);
      }
    }

    return {
      id: saved.id,
      name: saved.name,
      description: saved.description,
      author: saved.author,
      coverFileId: saved.coverFileId,
      voiceId: saved.voiceId,
      llmModelId: saved.llmModelId,
      promptId: saved.promptId,
      settings: saved.settings,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
  });

export const updateProjectVoiceSchema = z.object({
  id: z.number().int().positive(),
  voiceId: z.number().int().positive().nullable(),
  voiceSettings: z
    .object({
      speed: z.string().trim().max(40).optional(),
      instructions: z.string().trim().max(2000).optional(),
      customArgs: z
        .record(z.string(), z.unknown())
        .transform((v) => v as CustomArgs)
        .optional(),
    })
    .nullable(),
});

export const updateProjectVoice = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof updateProjectVoiceSchema>) =>
    updateProjectVoiceSchema.parse(data),
  )
  .handler(
    async ({
      data,
    }): Promise<{
      voiceId: number | null;
      voiceSettings: VoiceSettings | null;
    }> => {
      const [current] = await db
        .select({ settings: projects.settings })
        .from(projects)
        .where(and(eq(projects.id, data.id), isNull(projects.deletedAt)));
      if (!current) throw new Error(t("Project not found"));

      const vs = data.voiceSettings;
      const cleanedVs: VoiceSettings | null =
        vs &&
        (vs.speed?.trim() ||
          vs.instructions?.trim() ||
          (vs.customArgs && Object.keys(vs.customArgs).length > 0))
          ? {
              ...(vs.speed?.trim() ? { speed: vs.speed.trim() } : {}),
              ...(vs.instructions?.trim() ? { instructions: vs.instructions.trim() } : {}),
              ...(vs.customArgs && Object.keys(vs.customArgs).length > 0
                ? { customArgs: vs.customArgs }
                : {}),
            }
          : null;

      const prevSettings = current.settings ?? {};
      const settings: ProjectSettings = {
        ...prevSettings,
        ...(cleanedVs ? { voiceSettings: cleanedVs } : {}),
      };
      if (!cleanedVs) delete settings.voiceSettings;

      const hasSettings = Object.keys(settings).length > 0;
      const now = new Date();
      await db
        .update(projects)
        .set({
          voiceId: data.voiceId,
          settings: hasSettings ? settings : null,
          updatedAt: now,
        })
        .where(and(eq(projects.id, data.id), isNull(projects.deletedAt)));

      return { voiceId: data.voiceId, voiceSettings: cleanedVs };
    },
  );

const projectIdSchema = z.object({ projectId: z.number().int().positive() });

export type ProjectStats = {
  chapterCount: number;
  segments: {
    total: number;
    generated: number;
    ungenerated: number;
  };
  narrators: {
    total: number;
    used: number;
    unused: number;
  };
  ttsGenerations: {
    total: number;
    used: { count: number; size: number; duration: number };
    candidate: { count: number; size: number };
    orphan: { count: number; size: number };
  };
  exports: {
    count: number;
    size: number;
    outdated: { count: number; size: number };
  };
};

export const getProjectStats = createServerFn({ method: "GET" })
  .validator((data: z.input<typeof projectIdSchema>) => projectIdSchema.parse(data))
  .handler(async ({ data }): Promise<ProjectStats> => {
    const { projectId } = data;

    const [chapterRow] = await db
      .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(chapters)
      .where(and(eq(chapters.projectId, projectId), isNull(chapters.deletedAt)));

    const [segmentRow] = await db
      .select({
        total: sql<number>`COUNT(*)`.mapWith(Number),
        generated: sql<number>`COUNT(${segments.generationId})`.mapWith(Number),
      })
      .from(segments)
      .innerJoin(chapters, eq(chapters.id, segments.chapterId))
      .where(and(eq(chapters.projectId, projectId), isNull(chapters.deletedAt)));

    const [narratorTotalRow] = await db
      .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(narrators)
      .where(eq(narrators.projectId, projectId));

    const [narratorUsedRow] = await db
      .select({
        count: sql<number>`COUNT(DISTINCT ${segments.narratorId})`.mapWith(Number),
      })
      .from(segments)
      .innerJoin(chapters, eq(chapters.id, segments.chapterId))
      .where(
        and(
          eq(chapters.projectId, projectId),
          isNull(chapters.deletedAt),
          isNotNull(segments.narratorId),
        ),
      );

    // tts generation stats — file size / duration come from the files table.
    const [usedGenerationRow] = await db
      .select({
        count: sql<number>`COUNT(*)`.mapWith(Number),
        size: sql<number>`COALESCE(SUM(${files.fileSize}), 0)`.mapWith(Number),
        duration: sql<number>`COALESCE(SUM(${files.durationMs}), 0)`.mapWith(Number),
      })
      .from(ttsGenerations)
      .innerJoin(files, eq(files.id, ttsGenerations.fileId))
      .innerJoin(segments, eq(segments.generationId, ttsGenerations.id))
      .innerJoin(chapters, eq(chapters.id, segments.chapterId))
      .where(
        and(
          eq(ttsGenerations.projectId, projectId),
          eq(chapters.projectId, projectId),
          isNull(chapters.deletedAt),
        ),
      );

    const [generationTotalRow] = await db
      .select({
        total: sql<number>`COUNT(*)`.mapWith(Number),
        orphanCount:
          sql<number>`COUNT(*) FILTER (WHERE ${ttsGenerations.segmentId} IS NULL)`.mapWith(Number),
        orphanSize:
          sql<number>`COALESCE(SUM(${files.fileSize}) FILTER (WHERE ${ttsGenerations.segmentId} IS NULL), 0)`.mapWith(
            Number,
          ),
      })
      .from(ttsGenerations)
      .innerJoin(files, eq(files.id, ttsGenerations.fileId))
      .where(eq(ttsGenerations.projectId, projectId));

    const usedCount = usedGenerationRow?.count ?? 0;
    const usedSize = usedGenerationRow?.size ?? 0;
    const usedDuration = usedGenerationRow?.duration ?? 0;
    const totalGenerations = generationTotalRow?.total ?? 0;
    const orphanCount = generationTotalRow?.orphanCount ?? 0;
    const orphanSize = generationTotalRow?.orphanSize ?? 0;

    const [generationSizeRow] = await db
      .select({
        size: sql<number>`COALESCE(SUM(${files.fileSize}), 0)`.mapWith(Number),
      })
      .from(ttsGenerations)
      .innerJoin(files, eq(files.id, ttsGenerations.fileId))
      .where(eq(ttsGenerations.projectId, projectId));
    const totalGenerationSize = generationSizeRow?.size ?? 0;

    const candidateCount = totalGenerations - usedCount - orphanCount;
    const candidateSize = totalGenerationSize - usedSize - orphanSize;

    const [exportRow] = await db
      .select({
        count: sql<number>`COUNT(*)`.mapWith(Number),
        size: sql<number>`COALESCE(SUM(${files.fileSize}), 0)`.mapWith(Number),
      })
      .from(projectExports)
      .innerJoin(files, eq(files.id, projectExports.fileId))
      .where(eq(projectExports.projectId, projectId));
    const exportCount = exportRow?.count ?? 0;
    const exportSize = exportRow?.size ?? 0;

    let outdatedExportCount = 0;
    let outdatedExportSize = 0;
    if (exportCount > 1) {
      const [latest] = await db
        .select({ size: files.fileSize })
        .from(projectExports)
        .innerJoin(files, eq(files.id, projectExports.fileId))
        .where(eq(projectExports.projectId, projectId))
        .orderBy(desc(projectExports.createdAt), desc(projectExports.id))
        .limit(1);
      outdatedExportCount = exportCount - 1;
      outdatedExportSize = exportSize - (latest?.size ?? 0);
    }

    const narratorTotal = narratorTotalRow?.count ?? 0;
    const narratorUsed = narratorUsedRow?.count ?? 0;
    const segmentTotal = segmentRow?.total ?? 0;
    const segmentGenerated = segmentRow?.generated ?? 0;

    return {
      chapterCount: chapterRow?.count ?? 0,
      segments: {
        total: segmentTotal,
        generated: segmentGenerated,
        ungenerated: segmentTotal - segmentGenerated,
      },
      narrators: {
        total: narratorTotal,
        used: narratorUsed,
        unused: Math.max(0, narratorTotal - narratorUsed),
      },
      ttsGenerations: {
        total: totalGenerations,
        used: { count: usedCount, size: usedSize, duration: usedDuration },
        candidate: {
          count: Math.max(0, candidateCount),
          size: Math.max(0, candidateSize),
        },
        orphan: { count: orphanCount, size: orphanSize },
      },
      exports: {
        count: exportCount,
        size: exportSize,
        outdated: {
          count: outdatedExportCount,
          size: Math.max(0, outdatedExportSize),
        },
      },
    };
  });

export const deleteUnusedNarrators = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof projectIdSchema>) => projectIdSchema.parse(data))
  .handler(async ({ data }): Promise<{ deleted: number }> => {
    const usedRows = await db
      .selectDistinct({ id: segments.narratorId })
      .from(segments)
      .innerJoin(chapters, eq(chapters.id, segments.chapterId))
      .where(
        and(
          eq(chapters.projectId, data.projectId),
          isNull(chapters.deletedAt),
          isNotNull(segments.narratorId),
        ),
      );
    const usedIds = usedRows.map((r) => r.id).filter((id): id is number => id != null);

    const where =
      usedIds.length > 0
        ? and(eq(narrators.projectId, data.projectId), notInArray(narrators.id, usedIds))
        : eq(narrators.projectId, data.projectId);

    const deleted = await db.delete(narrators).where(where).returning({
      id: narrators.id,
    });
    return { deleted: deleted.length };
  });

export const clearCandidateGenerations = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof projectIdSchema>) => projectIdSchema.parse(data))
  .handler(async ({ data }): Promise<{ cleared: number }> => {
    const usedRows = await db
      .select({ id: segments.generationId })
      .from(segments)
      .innerJoin(chapters, eq(chapters.id, segments.chapterId))
      .where(
        and(
          eq(chapters.projectId, data.projectId),
          isNull(chapters.deletedAt),
          isNotNull(segments.generationId),
        ),
      );
    const usedIds = usedRows.map((r) => r.id).filter((id): id is number => id != null);

    const where =
      usedIds.length > 0
        ? and(
            eq(ttsGenerations.projectId, data.projectId),
            isNotNull(ttsGenerations.segmentId),
            notInArray(ttsGenerations.id, usedIds),
          )
        : and(eq(ttsGenerations.projectId, data.projectId), isNotNull(ttsGenerations.segmentId));

    const cleared = await db
      .update(ttsGenerations)
      .set({ segmentId: null })
      .where(where)
      .returning({ id: ttsGenerations.id });
    return { cleared: cleared.length };
  });

export const deleteOrphanGenerations = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof projectIdSchema>) => projectIdSchema.parse(data))
  .handler(async ({ data }): Promise<{ deleted: number }> => {
    const orphanRows = await db
      .select({ id: ttsGenerations.id, fileId: ttsGenerations.fileId })
      .from(ttsGenerations)
      .where(and(eq(ttsGenerations.projectId, data.projectId), isNull(ttsGenerations.segmentId)));
    if (orphanRows.length === 0) return { deleted: 0 };

    const { deleteFilesWithObjects } = await import("@/lib/files.server");
    db.transaction((tx) => {
      tx.delete(ttsGenerations)
        .where(
          inArray(
            ttsGenerations.id,
            orphanRows.map((r) => r.id),
          ),
        )
        .run();
      deleteFilesWithObjects(
        orphanRows.map((r) => r.fileId),
        tx,
      );
    });
    return { deleted: orphanRows.length };
  });

const MAX_COVER_BYTES = 10 * 1024 * 1024;

export const uploadProjectCover = createServerFn({ method: "POST" })
  .validator((data: FormData) => data)
  .handler(async ({ data }) => {
    const projectId = z.coerce.number().int().positive().parse(data.get("projectId"));
    const image = data.get("file");
    if (
      !(image instanceof File) ||
      !image.type.startsWith("image/") ||
      !image.size ||
      image.size > MAX_COVER_BYTES
    )
      throw new Error(t("Choose an image up to 10 MB"));
    const { buildObjectKey, uploadObject, deleteObject } = await import("./storage.server");
    const { finalizeUpload, deleteFileWithObject } = await import("./files.server");
    const path = buildObjectKey("covers", image.type);
    await uploadObject(path, Buffer.from(await image.arrayBuffer()));
    try {
      return db.transaction((tx) => {
        const project = tx
          .select()
          .from(projects)
          .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
          .get();
        if (!project) throw new Error(t("Project not found"));
        const file = finalizeUpload(
          {
            path,
            fileName: image.name,
            fileSize: image.size,
            fileMime: image.type,
            maxBytes: MAX_COVER_BYTES,
          },
          tx,
        );
        tx.update(projects)
          .set({ coverFileId: file.id, updatedAt: new Date() })
          .where(eq(projects.id, projectId))
          .run();
        if (project.coverFileId) deleteFileWithObject(project.coverFileId, tx);
        return { coverFileId: file.id };
      });
    } catch (error) {
      await deleteObject(path);
      throw error;
    }
  });

export type GlobalStats = {
  projects: { total: number; deleted: number };
  files: { count: number; size: number };
};

export const getGlobalStats = createServerFn({ method: "GET" }).handler(
  async (): Promise<GlobalStats> => {
    const [projectRow] = await db
      .select({
        total: sql<number>`COUNT(*) FILTER (WHERE ${projects.deletedAt} IS NULL)`.mapWith(Number),
        deleted: sql<number>`COUNT(*) FILTER (WHERE ${projects.deletedAt} IS NOT NULL)`.mapWith(
          Number,
        ),
      })
      .from(projects);

    const [fileRow] = await db
      .select({
        count: sql<number>`COUNT(*)`.mapWith(Number),
        size: sql<number>`COALESCE(SUM(${files.fileSize}), 0)`.mapWith(Number),
      })
      .from(files);

    return {
      projects: {
        total: projectRow?.total ?? 0,
        deleted: projectRow?.deleted ?? 0,
      },
      files: { count: fileRow?.count ?? 0, size: fileRow?.size ?? 0 },
    };
  },
);

export type DeletedProjectListItem = {
  id: number;
  name: string;
  author: string | null;
  deletedAt: Date;
  createdAt: Date;
  fileCount: number;
  fileSize: number;
};

export const listDeletedProjects = createServerFn({ method: "GET" }).handler(
  async (): Promise<DeletedProjectListItem[]> => {
    const rows = await db
      .select({
        id: projects.id,
        name: projects.name,
        author: projects.author,
        deletedAt: projects.deletedAt,
        createdAt: projects.createdAt,
      })
      .from(projects)
      .where(isNotNull(projects.deletedAt))
      .orderBy(desc(projects.deletedAt), desc(projects.id));

    if (rows.length === 0) return [];

    const projectIds = rows.map((r) => r.id);
    const fileIdsByProject = new Map<number, Set<number>>();
    for (const id of projectIds) fileIdsByProject.set(id, new Set());

    const genRows = await db
      .select({
        projectId: ttsGenerations.projectId,
        fileId: ttsGenerations.fileId,
      })
      .from(ttsGenerations)
      .where(inArray(ttsGenerations.projectId, projectIds));
    for (const r of genRows) fileIdsByProject.get(r.projectId)?.add(r.fileId);

    const exportRows = await db
      .select({
        projectId: projectExports.projectId,
        fileId: projectExports.fileId,
      })
      .from(projectExports)
      .where(inArray(projectExports.projectId, projectIds));
    for (const r of exportRows) fileIdsByProject.get(r.projectId)?.add(r.fileId);

    const coverRows = await db
      .select({ id: projects.id, coverFileId: projects.coverFileId })
      .from(projects)
      .where(inArray(projects.id, projectIds));
    for (const r of coverRows) {
      if (r.coverFileId != null) fileIdsByProject.get(r.id)?.add(r.coverFileId);
    }

    const allFileIds = Array.from(
      new Set(Array.from(fileIdsByProject.values()).flatMap((s) => Array.from(s))),
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
      const ids = fileIdsByProject.get(r.id) ?? new Set<number>();
      let size = 0;
      for (const id of ids) size += fileSizeById.get(id) ?? 0;
      return {
        id: r.id,
        name: r.name,
        author: r.author,
        // deletedAt is non-null here because of the WHERE filter, but the
        // inferred type is still `Date | null`.
        deletedAt: r.deletedAt!,
        createdAt: r.createdAt,
        fileCount: ids.size,
        fileSize: size,
      };
    });
  },
);

export const purgeProject = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof idSchema>) => idSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true; deletedFiles: number }> => {
    const [project] = await db
      .select({ id: projects.id, coverFileId: projects.coverFileId })
      .from(projects)
      .where(and(eq(projects.id, data.id), isNotNull(projects.deletedAt)));
    if (!project) throw new Error(t("Project not found in the recycle bin"));

    const fileIds = new Set<number>();
    if (project.coverFileId != null) fileIds.add(project.coverFileId);

    const genRows = await db
      .select({ fileId: ttsGenerations.fileId })
      .from(ttsGenerations)
      .where(eq(ttsGenerations.projectId, project.id));
    for (const r of genRows) fileIds.add(r.fileId);

    const exportRows = await db
      .select({ fileId: projectExports.fileId })
      .from(projectExports)
      .where(eq(projectExports.projectId, project.id));
    for (const r of exportRows) fileIds.add(r.fileId);

    if (project.coverFileId != null) {
      await db.update(projects).set({ coverFileId: null }).where(eq(projects.id, project.id));
    }

    await db.delete(projects).where(eq(projects.id, project.id));

    if (fileIds.size > 0) {
      const { deleteFilesWithObjects } = await import("@/lib/files.server");
      deleteFilesWithObjects(Array.from(fileIds));
    }

    return { ok: true as const, deletedFiles: fileIds.size };
  });

export const deleteOutdatedExportHistory = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof projectIdSchema>) => projectIdSchema.parse(data))
  .handler(async ({ data }): Promise<{ deleted: number }> => {
    const rows = await db
      .select({ id: projectExports.id, fileId: projectExports.fileId })
      .from(projectExports)
      .where(eq(projectExports.projectId, data.projectId))
      .orderBy(desc(projectExports.createdAt), desc(projectExports.id));
    if (rows.length <= 1) return { deleted: 0 };

    const outdated = rows.slice(1);
    const { deleteFilesWithObjects } = await import("@/lib/files.server");
    db.transaction((tx) => {
      tx.delete(projectExports)
        .where(
          inArray(
            projectExports.id,
            outdated.map((r) => r.id),
          ),
        )
        .run();
      deleteFilesWithObjects(
        outdated.map((r) => r.fileId),
        tx,
      );
    });
    return { deleted: outdated.length };
  });
