import { createFileRoute } from "@tanstack/react-router";
import { listTTSJobSegmentStates } from "@/mq/generate-segment.server";
import { snapshotStream } from "@/mq/stream.server";
export const Route = createFileRoute("/api/tts-jobs/segment-states/stream")({
  server: {
    handlers: {
      GET: ({ request }) => snapshotStream(request.signal, listTTSJobSegmentStates),
    },
  },
});
