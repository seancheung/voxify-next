import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { files } from "@/db/schema";
import { storageFile } from "@/lib/storage.server";
export const Route = createFileRoute("/api/files/$directory/$key")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const file = db
          .select()
          .from(files)
          .where(eq(files.path, `${params.directory}/${params.key}`))
          .get();
        if (!file) return new Response(null, { status: 404 });
        const path = storageFile(file.path);
        const { size } = await stat(path);
        const stream = (start?: number, end?: number) =>
          Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream<
            Uint8Array<ArrayBuffer>
          >;
        const headers = new Headers({
          "Content-Type": file.fileMime,
          "Accept-Ranges": "bytes",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "sandbox",
          "Cache-Control": "private, max-age=86400",
        });
        const name = new URL(request.url).searchParams.get("download");
        if (name)
          headers.set(
            "Content-Disposition",
            `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
          );
        const range = request.headers.get("Range");
        if (range) {
          const m = /^bytes=(\d*)-(\d*)$/.exec(range);
          const start = m?.[1] ? Number(m[1]) : Math.max(0, size - Number(m?.[2]));
          const end = m?.[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
          if (!m || (!m[1] && !m[2]) || start > end || start >= size)
            return new Response(null, {
              status: 416,
              headers: { "Content-Range": `bytes */${size}` },
            });
          headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
          headers.set("Content-Length", String(end - start + 1));
          return new Response(stream(start, end), { status: 206, headers });
        }
        headers.set("Content-Length", String(size));
        return new Response(stream(), { headers });
      },
    },
  },
});
