import { useEffect, useState } from "react";
import { t } from "@/i18n";
import type { TTSSegmentJobStates } from "@/lib/mq.functions";

const EMPTY: TTSSegmentJobStates = { active: [], pending: [], failed: [] };

// Subscribes to the lightweight per-segment state stream. Emits compact
// segmentId arrays only (no metadata), suitable for the segments panel's
// status badges.
export function useTTSSegmentStates(enabled: boolean): TTSSegmentJobStates {
  const [states, setStates] = useState<TTSSegmentJobStates>(EMPTY);

  useEffect(() => {
    if (!enabled) return;
    const es = new EventSource("/api/tts-jobs/segment-states/stream");
    es.onmessage = (e) => {
      try {
        setStates(JSON.parse(e.data) as TTSSegmentJobStates);
      } catch (err) {
        console.error(t("Failed to parse segment state event:"), err);
      }
    };
    return () => {
      es.close();
    };
  }, [enabled]);

  return states;
}
