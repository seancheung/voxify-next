import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { ProjectSettings } from "@/types/project";
import { files } from "./files";
import { llmModels } from "./llm-models";
import { prompts } from "./prompts";
import { voices } from "./voices";

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  coverFileId: integer("cover_file_id").references(() => files.id, {
    onDelete: "set null",
  }),
  author: text("author"),
  voiceId: integer("voice_id").references(() => voices.id, {
    onDelete: "set null",
  }),
  llmModelId: integer("llm_model_id").references(() => llmModels.id, {
    onDelete: "set null",
  }),
  promptId: integer("prompt_id").references(() => prompts.id, {
    onDelete: "set null",
  }),
  settings: text("settings", { mode: "json" }).$type<ProjectSettings>(),
  lastOpenedAt: integer("last_opened_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});

export type ProjectRow = InferSelectModel<typeof projects>;
export type ProjectInsert = InferInsertModel<typeof projects>;
