import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const configs = sqliteTable("configs", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }),
});

export type ConfigRow = InferSelectModel<typeof configs>;
export type ConfigInsert = InferInsertModel<typeof configs>;
