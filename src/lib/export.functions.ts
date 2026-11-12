import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { t } from "@/i18n";
import { appConfigSchema, DEFAULT_APP_CONFIG } from "@/lib/configs.functions";
import type { ExportSettingsSnapshot } from "@/types/export";

export type ExportJobInfo = {
  id: string;
  projectId: number;
  state: "waiting" | "active" | "completed" | "failed" | "unknown";
  scope: ExportSettingsSnapshot["scope"];
  format: ExportSettingsSnapshot["format"];
  createdAt: number;
  processedAt: number | null;
  finishedAt: number | null;
  failedReason: string | null;
};

export const startExportSchema = z.object({
  projectId: z.number().int().positive(),
  scope: z.enum(["chapter", "all-merged", "all-split"]),
  chapterId: z.number().int().positive().nullable(),
  format: z.enum(["mp3", "wav", "m4b"]),
  bitrate: z.union([z.literal(64), z.literal(96), z.literal(128), z.literal(192), z.literal(320)]),
  sampleRate: z.union([z.literal(44100), z.literal(48000)]),
  mono: z.boolean(),
  normalizeLufs: z.union([z.literal(-16), z.literal(-19), z.literal(-23)]).nullable(),
  subtitles: z.array(z.enum(["srt", "vtt"])).max(2),
});

export const startExport = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof startExportSchema>) => startExportSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean; jobId: string | null }> => {
    // Pre-flight: ensure at least one segment with a generation exists in scope.
    const { db } = await import("@/db");
    const { chapters, configs, projects, segments } = await import("@/db/schema");
    const { and, eq, isNotNull, isNull, sql } = await import("drizzle-orm");
    const where =
      data.scope === "chapter" && data.chapterId != null
        ? and(
            eq(chapters.projectId, data.projectId),
            isNull(chapters.deletedAt),
            eq(chapters.id, data.chapterId),
            isNotNull(segments.generationId),
          )
        : and(
            eq(chapters.projectId, data.projectId),
            isNull(chapters.deletedAt),
            isNotNull(segments.generationId),
          );
    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(segments)
      .innerJoin(chapters, eq(chapters.id, segments.chapterId))
      .where(where);
    if (!count) {
      throw new Error(t("Generate at least one segment before exporting"));
    }

    // Resolve gap values: project setting > app default > hardcoded fallback.
    const [project] = await db
      .select({ settings: projects.settings })
      .from(projects)
      .where(eq(projects.id, data.projectId));
    const [configRow] = await db.select().from(configs).where(eq(configs.key, "app_config"));
    const appConfig = appConfigSchema.safeParse(configRow?.value ?? {});
    const resolvedConfig = appConfig.success ? appConfig.data : DEFAULT_APP_CONFIG;
    const segmentGapMs = project?.settings?.gap ?? resolvedConfig.defaultSegmentGapMs;
    const chapterGapMs = project?.settings?.chapterGap ?? resolvedConfig.defaultChapterGapMs;

    const { addExportJob } = await import("@/mq/export-project.server");
    const job = await addExportJob({
      projectId: data.projectId,
      scope: data.scope,
      chapterId: data.scope === "chapter" ? data.chapterId : null,
      format: data.format,
      bitrate: data.bitrate,
      sampleRate: data.sampleRate,
      mono: data.mono,
      normalizeLufs: data.normalizeLufs,
      subtitles: data.subtitles,
      segmentGapMs,
      chapterGapMs,
    });
    if (!job) return { ok: false, jobId: null };
    return { ok: true, jobId: String(job.id) };
  });

const projectIdSchema = z.object({ projectId: z.number().int().positive() });

export type ProjectExportJob = {
  id: string;
  state: ExportJobInfo["state"];
  scope: ExportSettingsSnapshot["scope"];
  format: ExportSettingsSnapshot["format"];
  createdAt: number;
  processedAt: number | null;
};

export const getActiveExportJobForProject = createServerFn({ method: "GET" })
  .validator((data: z.input<typeof projectIdSchema>) => projectIdSchema.parse(data))
  .handler(async ({ data }): Promise<ProjectExportJob | null> => {
    const { findActiveJobForProject } = await import("@/mq/export-project.server");
    const job = await findActiveJobForProject(data.projectId);
    if (!job) return null;
    return job;
  });

export type ExportJobsSnapshot = {
  jobs: ExportJobInfo[];
  counts: {
    active: number;
    pending: number;
    completed: number;
    failed: number;
  };
};

export const listExportJobs = createServerFn({ method: "GET" }).handler(
  async (): Promise<ExportJobsSnapshot> => {
    const { listExportJobs: list } = await import("@/mq/export-project.server");
    return list();
  },
);

export type ExportJobsSummary = { hasRunning: boolean; hasFailed: boolean };

export const getExportJobsSummary = createServerFn({ method: "GET" }).handler(
  async (): Promise<ExportJobsSummary> => {
    const { counts } = await import("@/mq/queue.server");
    const c = counts("export");
    return { hasRunning: c.active + c.pending > 0, hasFailed: c.failed > 0 };
  },
);

const jobIdSchema = z.object({ jobId: z.string().min(1) });

export const cancelExportJob = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof jobIdSchema>) => jobIdSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { removeExportJob } = await import("@/mq/export-project.server");
    return { ok: await removeExportJob(data.jobId) };
  });

export const clearCompletedExportJobs = createServerFn({
  method: "POST",
}).handler(async (): Promise<{ count: number }> => {
  const { clearCompletedExportJobs: fn } = await import("@/mq/export-project.server");
  return { count: await fn() };
});

export const clearWaitingExportJobs = createServerFn({
  method: "POST",
}).handler(async (): Promise<{ count: number }> => {
  const { clearWaitingExportJobs: fn } = await import("@/mq/export-project.server");
  return { count: await fn() };
});

export const clearFailedExportJobs = createServerFn({
  method: "POST",
}).handler(async (): Promise<{ count: number }> => {
  const { clearFailedExportJobs: fn } = await import("@/mq/export-project.server");
  return { count: await fn() };
});

export type ExportHistoryItem = {
  id: number;
  projectId: number;
  settings: ExportSettingsSnapshot;
  createdAt: Date;
  file: {
    id: number;
    fileName: string;
    fileMime: string;
    fileSize: number;
  };
};

export const listExportHistory = createServerFn({ method: "GET" })
  .validator((data: z.input<typeof projectIdSchema>) => projectIdSchema.parse(data))
  .handler(async ({ data }): Promise<ExportHistoryItem[]> => {
    const { db } = await import("@/db");
    const { projectExports, files } = await import("@/db/schema");
    const { eq, desc } = await import("drizzle-orm");
    const rows = await db
      .select({
        id: projectExports.id,
        projectId: projectExports.projectId,
        settings: projectExports.settings,
        createdAt: projectExports.createdAt,
        fileId: files.id,
        fileName: files.fileName,
        fileMime: files.fileMime,
        fileSize: files.fileSize,
      })
      .from(projectExports)
      .innerJoin(files, eq(files.id, projectExports.fileId))
      .where(eq(projectExports.projectId, data.projectId))
      .orderBy(desc(projectExports.createdAt), desc(projectExports.id));
    return rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      settings: r.settings,
      createdAt: r.createdAt,
      file: {
        id: r.fileId,
        fileName: r.fileName,
        fileMime: r.fileMime,
        fileSize: r.fileSize,
      },
    }));
  });

const historyIdSchema = z.object({ id: z.number().int().positive() });

export const getExportDownloadUrl = createServerFn({ method: "GET" })
  .validator((data: z.input<typeof historyIdSchema>) => historyIdSchema.parse(data))
  .handler(async ({ data }): Promise<{ url: string; fileName: string }> => {
    const { db } = await import("@/db");
    const { projectExports, files } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await db
      .select({
        path: files.path,
        fileMime: files.fileMime,
        fileName: files.fileName,
      })
      .from(projectExports)
      .innerJoin(files, eq(files.id, projectExports.fileId))
      .where(eq(projectExports.id, data.id));
    if (!row) throw new Error(t("File not found"));
    const { fileDownloadUrl } = await import("@/lib/files.server");
    const url = await fileDownloadUrl(row, { asAttachment: true });
    return { url, fileName: row.fileName };
  });

export const deleteExportHistory = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof historyIdSchema>) => historyIdSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { db } = await import("@/db");
    const { projectExports } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await db
      .select({ fileId: projectExports.fileId })
      .from(projectExports)
      .where(eq(projectExports.id, data.id));
    if (!row) return { ok: true as const };
    const { deleteFileWithObject } = await import("@/lib/files.server");
    db.transaction((tx) => {
      tx.delete(projectExports).where(eq(projectExports.id, data.id)).run();
      deleteFileWithObject(row.fileId, tx);
    });
    return { ok: true as const };
  });
