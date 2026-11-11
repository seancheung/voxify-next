import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { TTSCapabilities, TTSServiceType, TTSSettings } from "@/types/tts";

export const ttsServices = sqliteTable("tts_services", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: integer("type").notNull().$type<TTSServiceType>(),
  baseUrl: text("base_url").notNull(),
  previewBaseUrl: text("preview_base_url"),
  bearerToken: text("bearer_token"),
  capabilities: text("capabilities", { mode: "json" }).$type<TTSCapabilities>(),
  sampleRate: integer("sample_rate"),
  settings: text("settings", { mode: "json" }).$type<TTSSettings>(),
  enabled: integer("enabled", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export type TTSServiceRow = InferSelectModel<typeof ttsServices>;
export type TTSServiceInsert = InferInsertModel<typeof ttsServices>;
