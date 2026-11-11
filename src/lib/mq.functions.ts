import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type TTSJobInfo = {
  id: string;
  segmentId: number;
  state: "waiting" | "active" | "completed" | "failed" | "unknown";
  createdAt: number;
  processedAt: number | null;
  finishedAt: number | null;
  failedReason: string | null;
};

export type JobsCounts = {
  active: number;
  pending: number;
  completed: number;
  failed: number;
};

// Snapshot used by the tasks drawer SSE stream. `jobs` is capped at ~20
// per group (active / pending / completed / failed) — the drawer never
// shows more than that. `counts` holds true totals for each group so
// the UI can show accurate numbers even when jobs is sliced. Connection
// only opens while the drawer is open.
export type TTSJobsSnapshot = {
  jobs: TTSJobInfo[];
  counts: JobsCounts;
};

// Compact snapshot used by the per-segment status badges in the segments
// panel. Each array holds segmentIds whose newest job is in that bucket
// (older jobs are shadowed). Carries no metadata — the panel only needs
// to know "which of my segments are queued / generating / failed" to
// render their status. Streamed on its own SSE channel so the segments
// panel doesn't pull the drawer's full payload.
export type TTSSegmentJobStates = {
  active: number[];
  pending: number[];
  failed: number[];
};

export const listTTSJobs = createServerFn({ method: "GET" }).handler(
  async (): Promise<TTSJobsSnapshot> => {
    const { listTTSJobs: list } = await import("@/mq/generate-segment.server");
    return list();
  },
);

export type TTSJobsSummary = { hasRunning: boolean; hasFailed: boolean };

export const getTTSJobsSummary = createServerFn({ method: "GET" }).handler(
  async (): Promise<TTSJobsSummary> => {
    const { counts } = await import("@/mq/queue.server");
    const c = counts("tts");
    return { hasRunning: c.active + c.pending > 0, hasFailed: c.failed > 0 };
  },
);

const jobIdSchema = z.object({ jobId: z.string().min(1) });

export const cancelTTSJob = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof jobIdSchema>) => jobIdSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { removeTTSJob } = await import("@/mq/generate-segment.server");
    return { ok: await removeTTSJob(data.jobId) };
  });

export const retryTTSJob = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof jobIdSchema>) => jobIdSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { retryTTSJob: retry } = await import("@/mq/generate-segment.server");
    return { ok: await retry(data.jobId) };
  });

export const clearCompletedJobs = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ count: number }> => {
    const { clearCompletedTTSJobs } = await import("@/mq/generate-segment.server");
    return { count: await clearCompletedTTSJobs() };
  },
);

export const clearWaitingJobs = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ count: number }> => {
    const { clearWaitingTTSJobs } = await import("@/mq/generate-segment.server");
    return { count: await clearWaitingTTSJobs() };
  },
);

export const retryAllFailedJobs = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ count: number }> => {
    const { retryAllFailedTTSJobs } = await import("@/mq/generate-segment.server");
    return { count: await retryAllFailedTTSJobs() };
  },
);

export const clearFailedJobs = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ count: number }> => {
    const { clearFailedTTSJobs } = await import("@/mq/generate-segment.server");
    return { count: await clearFailedTTSJobs() };
  },
);

export type QueueStatus = {
  paused: boolean;
  running: number;
  failed: number;
};

export const queueKeys = ["tts", "design-voice", "export"] as const;
export const clearCompletedQueueJobs = createServerFn({ method: "POST" }).handler(async () => {
  const { queueDatabase } = await import("@/mq/queue.server");
  const placeholders = queueKeys.map(() => "?").join(", ");
  const { changes } = queueDatabase()
    .prepare(`DELETE FROM sidequest_jobs WHERE state = 'completed' AND queue IN (${placeholders})`)
    .run(...queueKeys);
  return { count: changes };
});
export type QueueKey = (typeof queueKeys)[number];
export type QueuesStatus = Record<QueueKey, QueueStatus>;

export const getQueuesStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<QueuesStatus> => {
    const { Sidequest } = await import("sidequest");
    const { counts } = await import("@/mq/queue.server");
    async function status(queue: QueueKey) {
      const c = counts(queue);
      return {
        paused: (await Sidequest.queue.get(queue))?.state === "paused",
        running: c.active + c.pending,
        failed: c.failed,
      };
    }
    const [tts, design, projectExport] = await Promise.all([
      status("tts"),
      status("design-voice"),
      status("export"),
    ]);
    return { tts, "design-voice": design, export: projectExport };
  },
);

const setPausedSchema = z.object({
  queue: z.enum(queueKeys),
  paused: z.boolean(),
});

export const setQueuePaused = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof setPausedSchema>) => setPausedSchema.parse(data))
  .handler(async ({ data }): Promise<{ paused: boolean }> => {
    const { Sidequest } = await import("sidequest");
    if (data.paused) await Sidequest.queue.pause(data.queue);
    else await Sidequest.queue.activate(data.queue);
    return { paused: data.paused };
  });
