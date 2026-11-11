import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { type JobData, type JobState, Sidequest } from "sidequest";
export function jobClasses(): Promise<typeof import("./jobs")> {
  const url = pathToFileURL(resolve(".jobs/index.mjs")).href;
  return import(/* @vite-ignore */ url);
}
let connection: Database.Database | undefined;
export function queueDatabase() {
  return (connection ??= new Database(process.env.SIDEQUEST_DATABASE_URL || "sidequest.sqlite", {
    fileMustExist: true,
  }));
}
export const activeStates: JobState[] = ["waiting", "claimed", "running"];
export function info(job: JobData) {
  return {
    id: String(job.id),
    state:
      job.state === "running" || job.state === "claimed"
        ? ("active" as const)
        : job.state === "canceled"
          ? ("unknown" as const)
          : job.state,
    createdAt: job.inserted_at.getTime(),
    processedAt: job.attempted_at?.getTime() ?? null,
    finishedAt: (job.completed_at ?? job.failed_at)?.getTime() ?? null,
    failedReason: job.errors?.at(-1)?.message ?? null,
  };
}
export function counts(queue: string) {
  const result = { active: 0, pending: 0, failed: 0, completed: 0 };
  for (const row of queueDatabase()
    .prepare("select state,count(*) as n from sidequest_jobs where queue=? group by state")
    .all(queue) as { state: JobState; n: number }[]) {
    if (row.state === "waiting") result.pending = row.n;
    else if (row.state === "claimed" || row.state === "running") result.active += row.n;
    else if (row.state !== "canceled") result[row.state] = row.n;
  }
  return result;
}
export async function snapshot<T>(queue: string, format: (job: JobData) => T) {
  const groups: JobState[][] = [["claimed", "running"], ["waiting"], ["failed"], ["completed"]];
  const rows = (
    await Promise.all(groups.map((state) => Sidequest.job.list({ queue, state, limit: 20 })))
  )
    .flat()
    .sort((a, b) => b.id - a.id);
  return { jobs: rows.map(format), counts: counts(queue) };
}
export async function remove(queue: string, id: string) {
  const job = await Sidequest.job.get(Number(id));
  if (!job || job.queue !== queue) return false;
  if (activeStates.includes(job.state)) {
    await Sidequest.job.cancel(job.id);
    return true;
  }
  queueDatabase()
    .prepare(
      "delete from sidequest_jobs where queue=? and id=? and state in ('canceled','completed','failed')",
    )
    .run(queue, job.id);
  return true;
}
export async function clear(queue: string, state: "failed" | "completed" | "waiting") {
  return queueDatabase()
    .prepare("delete from sidequest_jobs where queue=? and state=?")
    .run(queue, state).changes;
}
