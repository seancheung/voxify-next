import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { files } from "./files";
import { ttsServices } from "./tts-services";

export const voiceDesigns = sqliteTable(
  "voice_designs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    // Records which service generated the audio; once rendered the file is
    // self-contained, so deleting the service detaches the reference rather
    // than removing the design.
    ttsServiceId: integer("tts_service_id").references(() => ttsServices.id, {
      onDelete: "set null",
    }),
    instruct: text("instruct").notNull(),
    input: text("input").notNull(),
    // Null while the generation job is queued/running; populated when the
    // worker writes the rendered audio.
    fileId: integer("file_id").references(() => files.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().$type<VoiceDesignStatus>(),
    errorMessage: text("error_message"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("idx_voice_design_created").on(t.createdAt)],
);

export type VoiceDesignStatus = "pending" | "running" | "ready" | "failed";

export type VoiceDesignRow = InferSelectModel<typeof voiceDesigns>;
export type VoiceDesignInsert = InferInsertModel<typeof voiceDesigns>;
