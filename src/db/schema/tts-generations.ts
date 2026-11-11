import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { type AnySQLiteColumn, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { TTSPayload } from "@/types/tts";
import { files } from "./files";
import { projects } from "./projects";
import { segments } from "./segments";

export const ttsGenerations = sqliteTable(
  "tts_generations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    editedFromGenerationId: integer("edited_from_generation_id").references(
      (): AnySQLiteColumn => ttsGenerations.id,
      { onDelete: "set null" },
    ),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    segmentId: integer("segment_id").references(() => segments.id, {
      onDelete: "set null",
    }),
    fileId: integer("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "restrict" }),
    payload: text("payload", { mode: "json" }).$type<TTSPayload>(),
    serviceUrl: text("service_url"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("ix_tts_generation_segment").on(t.segmentId, t.createdAt),
    index("ix_tts_generation_project").on(t.projectId, t.createdAt),
  ],
);

export type TTSGenerationRow = InferSelectModel<typeof ttsGenerations>;
export type TTSGenerationInsert = InferInsertModel<typeof ttsGenerations>;
