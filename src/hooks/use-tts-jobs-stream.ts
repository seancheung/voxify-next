import { useEffect, useState } from "react";
import { t } from "@/i18n";
import type { JobsCounts, TTSJobInfo, TTSJobsSnapshot } from "@/lib/mq.functions";

const EMPTY_COUNTS: JobsCounts = {
  active: 0,
  pending: 0,
  completed: 0,
  failed: 0,
};

export function useTTSJobsStream(enabled: boolean): {
  jobs: TTSJobInfo[];
  counts: JobsCounts;
  loading: boolean;
} {
  const [jobs, setJobs] = useState<TTSJobInfo[]>([]);
  const [counts, setCounts] = useState<JobsCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    const es = new EventSource("/api/tts-jobs/stream");
    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data) as TTSJobsSnapshot;
        setJobs(parsed.jobs);
        setCounts(parsed.counts);
        setLoading(false);
      } catch (err) {
        console.error(t("Failed to parse SSE message:"), err);
      }
    };
    es.onerror = () => {
      setLoading(false);
    };
    return () => {
      es.close();
    };
  }, [enabled]);

  return { jobs, counts, loading };
}
