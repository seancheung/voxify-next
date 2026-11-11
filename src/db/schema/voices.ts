import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { VoiceMetadata } from "@/types/tts";
import { ttsServices } from "./tts-services";

export const voices = sqliteTable(
  "voices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ttsServiceId: integer("tts_service_id")
      .notNull()
      .references(() => ttsServices.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    metadata: text("metadata", { mode: "json" }).$type<VoiceMetadata>(),
    previewUrl: text("preview_url"),
    promptText: text("prompt_text"),
    enabled: integer("enabled", { mode: "boolean" }).default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("uni_service_voice").on(t.ttsServiceId, t.key)],
);

export type VoiceRow = InferSelectModel<typeof voices>;
export type VoiceInsert = InferInsertModel<typeof voices>;
