import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const files = sqliteTable("files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  path: text("path").notNull().unique(),
  fileName: text("file_name").notNull(),
  fileMime: text("file_mime").notNull(),
  fileSize: integer("file_size").notNull(),
  // Audio-only. NULL for images / export bundles.
  durationMs: integer("duration_ms"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export type FileRow = InferSelectModel<typeof files>;
export type FileInsert = InferInsertModel<typeof files>;
