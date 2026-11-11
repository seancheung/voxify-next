import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { ExportSettingsSnapshot } from "@/types/export";
import { files } from "./files";
import { projects } from "./projects";

export const projectExports = sqliteTable(
  "project_exports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    fileId: integer("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "restrict" }),
    settings: text("settings", { mode: "json" }).$type<ExportSettingsSnapshot>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("idx_project_exports_project_created").on(t.projectId, t.createdAt)],
);

export type ProjectExportRow = InferSelectModel<typeof projectExports>;
export type ProjectExportInsert = InferInsertModel<typeof projectExports>;
