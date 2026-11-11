import { z } from "zod";
export const appConfigSchema = z.object({
  defaultLlmModelId: z.number().int().positive().nullable().default(null),
  defaultPromptId: z.number().int().positive().nullable().default(null),
  defaultTtsTimeoutMs: z.number().int().min(1000).max(600_000).default(60_000),
  defaultLlmTimeoutMs: z.number().int().min(1000).max(600_000).default(30_000),
  defaultSegmentGapMs: z.number().int().min(0).max(60_000).default(300),
  defaultChapterGapMs: z.number().int().min(0).max(600_000).default(2000),
});

export type AppConfig = z.infer<typeof appConfigSchema>;
export const DEFAULT_APP_CONFIG: AppConfig = appConfigSchema.parse({});
