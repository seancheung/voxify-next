import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { LLMSettings, LLMType } from "@/types/llm";

export const llmServices = sqliteTable("llm_services", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: integer("type").notNull().$type<LLMType>(),
  baseUrl: text("base_url").notNull(),
  apiKey: text("api_key"),
  settings: text("settings", { mode: "json" }).$type<LLMSettings>(),
  enabled: integer("enabled", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export type LLMServiceRow = InferSelectModel<typeof llmServices>;
export type LLMServiceInsert = InferInsertModel<typeof llmServices>;
