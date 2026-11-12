import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { type FileRow, files } from "@/db/schema";
import { t } from "@/i18n";
import { deleteObject } from "./storage.server";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
export function finalizeUpload(
  input: {
    path: string;
    fileName: string;
    maxBytes: number;
    fileSize: number;
    fileMime: string;
    durationMs?: number;
  },
  tx: DbOrTx = db,
) {
  if (input.fileSize > input.maxBytes) {
    throw new Error(t("File too large"));
  }
  return tx
    .insert(files)
    .values({
      path: input.path,
      fileName: input.fileName,
      fileSize: input.fileSize,
      fileMime: input.fileMime,
      durationMs: input.durationMs,
      createdAt: new Date(),
    })
    .returning()
    .get();
}
export function fileDownloadUrl(
  file: Pick<FileRow, "path" | "fileName" | "fileMime">,
  opts: { downloadName?: string; asAttachment?: boolean } = {},
) {
  const query = opts.asAttachment
    ? `?download=${encodeURIComponent(opts.downloadName ?? file.fileName)}`
    : "";
  return `/api/files/${file.path}${query}`;
}
export function deleteFilesWithObjects(ids: number[], tx: DbOrTx = db) {
  const removed = tx
    .delete(files)
    .where(inArray(files.id, ids))
    .returning({ path: files.path })
    .all();
  // Check after the synchronous transaction completes so a rollback keeps its file.
  queueMicrotask(() => {
    for (const { path } of removed) {
      if (!db.select({ id: files.id }).from(files).where(eq(files.path, path)).get())
        void deleteObject(path).catch(console.error);
    }
  });
}
export function deleteFileWithObject(id: number, tx: DbOrTx = db) {
  deleteFilesWithObjects([id], tx);
}
