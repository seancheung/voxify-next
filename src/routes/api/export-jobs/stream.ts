import { createFileRoute } from "@tanstack/react-router";
import { listExportJobs } from "@/mq/export-project.server";
import { snapshotStream } from "@/mq/stream.server";
export const Route = createFileRoute("/api/export-jobs/stream")({
  server: {
    handlers: {
      GET: ({ request }) => snapshotStream(request.signal, listExportJobs),
    },
  },
});
