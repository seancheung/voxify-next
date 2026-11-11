import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { VoiceSettings } from "@/types/tts";
import { projects } from "./projects";
import { voices } from "./voices";

export const narrators = sqliteTable(
  "narrators",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    voiceId: integer("voice_id").references(() => voices.id, {
      onDelete: "set null",
    }),
    voiceSettings: text("voice_settings", {
      mode: "json",
    }).$type<VoiceSettings>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("uni_narrator_project_name").on(t.projectId, t.name)],
);

export type NarratorRow = InferSelectModel<typeof narrators>;
export type NarratorInsert = InferInsertModel<typeof narrators>;
