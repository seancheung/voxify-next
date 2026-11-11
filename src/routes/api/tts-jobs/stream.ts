import { createFileRoute } from "@tanstack/react-router";
import { listTTSJobs } from "@/mq/generate-segment.server";
import { snapshotStream } from "@/mq/stream.server";
export const Route = createFileRoute("/api/tts-jobs/stream")({
  server: {
    handlers: {
      GET: ({ request }) => snapshotStream(request.signal, listTTSJobs),
    },
  },
});
