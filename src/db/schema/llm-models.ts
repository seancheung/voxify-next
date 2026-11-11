import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { LLMModelMetadata } from "@/types/llm";
import { llmServices } from "./llm-services";

export const llmModels = sqliteTable(
  "llm_models",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    llmServiceId: integer("llm_service_id")
      .notNull()
      .references(() => llmServices.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    metadata: text("metadata", { mode: "json" }).$type<LLMModelMetadata>(),
    enabled: integer("enabled", { mode: "boolean" }).default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("uni_llm_service_model").on(t.llmServiceId, t.key)],
);

export type LLMModelRow = InferSelectModel<typeof llmModels>;
export type LLMModelInsert = InferInsertModel<typeof llmModels>;
