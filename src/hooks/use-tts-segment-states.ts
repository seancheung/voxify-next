import { useEffect, useState } from "react";
import { t } from "@/i18n";
import type { TTSSegmentJobStates } from "@/lib/mq.functions";

const EMPTY: TTSSegmentJobStates = { active: [], pending: [], failed: [] };

// Subscribes to the lightweight per-segment state stream. Emits compact
// segmentId arrays only (no metadata), suitable for the segments panel's
// status badges.
export function useTTSSegmentStates(revision: number) {
  const [states, setStates] = useState({ jobs: EMPTY, revision: -1 });

  useEffect(() => {
    const es = new EventSource("/api/tts-jobs/segment-states/stream");
    es.onmessage = (e) => {
      try {
        setStates({ jobs: JSON.parse(e.data) as TTSSegmentJobStates, revision });
      } catch (err) {
        console.error(t("Failed to parse segment state event:"), err);
      }
    };
    return () => {
      es.close();
    };
  }, [revision]);

  return states;
}
