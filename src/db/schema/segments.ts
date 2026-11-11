import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { VoiceSettings } from "@/types/tts";
import { chapters } from "./chapters";
import { narrators } from "./narrators";
import { voices } from "./voices";

export const segments = sqliteTable(
  "segments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    chapterId: integer("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    narratorId: integer("narrator_id").references(() => narrators.id, {
      onDelete: "set null",
    }),
    voiceId: integer("voice_id").references(() => voices.id, {
      onDelete: "set null",
    }),
    generationId: integer("generation_id"),
    content: text("content"),
    voiceSettings: text("voice_settings", {
      mode: "json",
    }).$type<VoiceSettings>(),
    sortOrder: integer("sort_order").notNull(),
    isStale: integer("is_stale", { mode: "boolean" }).default(true),
    leadingSilence: integer("leading_silence"),
    trailingSilence: integer("trailing_silence"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("idx_segment_chapter_order").on(t.chapterId, t.sortOrder)],
);

export type SegmentRow = InferSelectModel<typeof segments>;
export type SegmentInsert = InferInsertModel<typeof segments>;
