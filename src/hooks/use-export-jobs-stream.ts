import { useEffect, useState } from "react";
import type { ExportJobInfo, ExportJobsSnapshot } from "@/lib/export.functions";
import type { JobsCounts } from "@/lib/mq.functions";

const EMPTY_COUNTS: JobsCounts = {
  active: 0,
  pending: 0,
  completed: 0,
  failed: 0,
};

export function useExportJobsStream(enabled: boolean): {
  jobs: ExportJobInfo[];
  counts: JobsCounts;
  loading: boolean;
} {
  const [jobs, setJobs] = useState<ExportJobInfo[]>([]);
  const [counts, setCounts] = useState<JobsCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    const es = new EventSource("/api/export-jobs/stream");
    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data) as ExportJobsSnapshot;
        setJobs(parsed.jobs);
        setCounts(parsed.counts);
        setLoading(false);
      } catch (err) {
        console.error("解析 SSE 消息失败:", err);
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
