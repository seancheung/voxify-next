import { type JobData, Sidequest } from "sidequest";
import type { ExportJobInfo } from "@/lib/export.functions";
import type {
  ExportBitrate,
  ExportFormat,
  ExportSampleRate,
  ExportScope,
  SubtitleFormat,
} from "@/types/export";
import { activeStates, clear, info, jobClasses, remove, snapshot } from "./queue.server";

export type ExportJobData = {
  projectId: number;
  scope: ExportScope;
  chapterId: number | null;
  format: ExportFormat;
  bitrate: ExportBitrate;
  sampleRate: ExportSampleRate;
  mono: boolean;
  /** Target integrated loudness in LUFS (-16/-19/-23) or null to disable. */
  normalizeLufs: number | null;
  subtitles: SubtitleFormat[];
  segmentGapMs: number;
  chapterGapMs: number;
};

function format(job: JobData): ExportJobInfo {
  const data = job.args[0] as ExportJobData;
  return {
    ...info(job),
    projectId: data.projectId,
    format: data.format,
    scope: data.scope,
  };
}
export async function findActiveJobForProject(projectId: number) {
  const rows = await Sidequest.job.list({
    queue: "export",
    state: activeStates,
    limit: -1,
  });
  const job = rows.find((row) => (row.args[0] as ExportJobData).projectId === projectId);
  return job ? format(job) : null;
}
const submitting = new Set<number>();
export async function addExportJob(data: ExportJobData) {
  if (submitting.has(data.projectId)) return null;
  submitting.add(data.projectId);
  try {
    if (await findActiveJobForProject(data.projectId)) return null;
    const { ExportProject } = await jobClasses();
    return await Sidequest.build(ExportProject).queue("export").maxAttempts(1).enqueue(data);
  } finally {
    submitting.delete(data.projectId);
  }
}
export const listExportJobs = () => snapshot("export", format);
export const removeExportJob = (id: string) => remove("export", id);
export const clearCompletedExportJobs = () => clear("export", "completed");
export const clearFailedExportJobs = () => clear("export", "failed");
export const clearWaitingExportJobs = () => clear("export", "waiting");
