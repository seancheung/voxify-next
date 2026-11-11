import { DuplicatedJobError, type JobData, Sidequest } from "sidequest";
import type { TTSJobInfo, TTSSegmentJobStates } from "@/lib/mq.functions";
import {
  activeStates,
  clear,
  info,
  jobClasses,
  queueDatabase,
  remove,
  snapshot,
} from "./queue.server";

function format(job: JobData): TTSJobInfo {
  return { ...info(job), segmentId: Number(job.args[0]) };
}
export const listTTSJobs = () => snapshot("tts", format);
export async function getActiveJobSegmentIds() {
  return new Set(
    (await Sidequest.job.list({ queue: "tts", state: activeStates, limit: -1 })).map((job) =>
      Number(job.args[0]),
    ),
  );
}
export async function addTTSJobsBulk(ids: number[]) {
  const { GenerateSegment } = await jobClasses();
  let enqueued = 0;
  for (const id of ids) {
    try {
      await Sidequest.build(GenerateSegment)
        .queue("tts")
        .unique({ withArgs: true })
        .maxAttempts(1)
        .enqueue(id);
      enqueued++;
    } catch (error) {
      if (!(error instanceof DuplicatedJobError)) throw error;
    }
  }
  return enqueued;
}
export async function listTTSJobSegmentStates() {
  const result: TTSSegmentJobStates = { active: [], pending: [], failed: [] };
  const latest = queueDatabase()
    .prepare(`
   SELECT segmentId,state FROM (
    SELECT json_extract(args,'$[0]') AS segmentId,state,
     row_number() OVER (PARTITION BY args ORDER BY id DESC) AS position
    FROM sidequest_jobs WHERE queue='tts' AND state<>'canceled'
   ) WHERE position=1 AND state<>'completed'
 `)
    .all() as {
    segmentId: number;
    state: "waiting" | "running" | "claimed" | "failed";
  }[];
  for (const { segmentId, state } of latest) {
    if (state === "waiting") result.pending.push(segmentId);
    else if (state === "failed") result.failed.push(segmentId);
    else result.active.push(segmentId);
  }
  return result;
}
export const removeTTSJob = (id: string) => remove("tts", id);
export async function cancelTTSJobsBySegmentIds(ids: number[]) {
  const targets = new Set(ids);
  let removed = 0,
    cancelled = 0;
  for (const job of await Sidequest.job.list({
    queue: "tts",
    state: activeStates,
    limit: -1,
  })) {
    if (!targets.has(Number(job.args[0]))) continue;
    await removeTTSJob(String(job.id));
    if (job.state === "waiting") removed++;
    else cancelled++;
  }
  return { removed, cancelled };
}
export async function retryTTSJob(id: string) {
  const job = await Sidequest.job.get(Number(id));
  if (job?.queue !== "tts" || job.state !== "failed") return false;
  await Sidequest.job.run(job.id, true);
  return true;
}
export async function retryAllFailedTTSJobs() {
  const failed = await Sidequest.job.list({
    queue: "tts",
    state: "failed",
    limit: -1,
  });
  for (const job of failed) await retryTTSJob(String(job.id));
  return failed.length;
}
export const clearCompletedTTSJobs = () => clear("tts", "completed");
export const clearFailedTTSJobs = () => clear("tts", "failed");
export const clearWaitingTTSJobs = () => clear("tts", "waiting");
