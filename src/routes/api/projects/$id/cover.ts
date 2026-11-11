import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/projects/$id/cover")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const id = Number(params.id);
        if (!Number.isFinite(id) || id <= 0) {
          return new Response("invalid id", { status: 400 });
        }

        const { eq } = await import("drizzle-orm");
        const { db } = await import("@/db");
        const { files, projects } = await import("@/db/schema");

        const [row] = await db
          .select({
            path: files.path,
            fileMime: files.fileMime,
            fileName: files.fileName,
          })
          .from(projects)
          .innerJoin(files, eq(files.id, projects.coverFileId))
          .where(eq(projects.id, id));
        if (!row) {
          return new Response("not found", { status: 404 });
        }

        const { fileDownloadUrl } = await import("@/lib/files.server");
        const url = await fileDownloadUrl(row);
        return Response.redirect(new URL(url, request.url), 302);
      },
    },
  },
});
