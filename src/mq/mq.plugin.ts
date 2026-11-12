import { resolve } from "node:path";
import { definePlugin } from "nitro";
import { Sidequest } from "sidequest";
export default definePlugin(async (app) => {
  await Sidequest.start({
    logger: { level: "warn" },
    backend: {
      driver: "@sidequest/sqlite-backend",
      config: process.env.SIDEQUEST_DATABASE_URL || "sidequest.sqlite",
    },
    dashboard: { enabled: false },
    manualJobResolution: true,
    jobsFilePath: resolve(".jobs/index.mjs"),
    // In dev, let Nitro's close hook stop the worker on Ctrl+C.
    fork: !import.meta.env.DEV,
    gracefulShutdown: !import.meta.env.DEV,
    runner: "inline",
    maxConcurrentJobs: 1,
    queues: [
      ["tts", "GENERATE_SEGMENT_CONCURRENCY"],
      ["export", "EXPORT_PROJECT_CONCURRENCY"],
      ["design-voice", "DESIGN_VOICE_CONCURRENCY"],
    ].map(([name, key]) => ({
      name,
      concurrency: Math.max(1, parseInt(process.env[key] || "1", 10) || 1),
    })),
  });
  app.hooks.hook("close", () => Sidequest.stop());
});
