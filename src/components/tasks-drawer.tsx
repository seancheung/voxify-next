import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2Icon,
  CircleDashedIcon,
  DownloadIcon,
  ListChecksIcon,
  Loader2Icon,
  RefreshCwIcon,
  SquareIcon,
  Trash2Icon,
  XCircleIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import Button from "@/components/ui/button";
import Drawer from "@/components/ui/drawer";
import Select, { type SelectOption } from "@/components/ui/select";
import Tabs from "@/components/ui/tab";
import { toast } from "@/components/ui/toast";
import { useExportJobsStream } from "@/hooks/use-export-jobs-stream";
import { useTTSJobsStream } from "@/hooks/use-tts-jobs-stream";
import {
  cancelExportJob,
  clearCompletedExportJobs,
  clearFailedExportJobs,
  clearWaitingExportJobs,
  type ExportJobInfo,
} from "@/lib/export.functions";
import {
  cancelTTSJob,
  clearCompletedJobs,
  clearFailedJobs,
  clearWaitingJobs,
  retryAllFailedJobs,
  retryTTSJob,
  type TTSJobInfo,
} from "@/lib/mq.functions";
import { listDesignJobs } from "@/lib/voice-designs.functions";
import { cn } from "@/utils/cn";
import { relativeTime } from "@/utils/datetime";

type StateGroup = "active" | "pending" | "failed" | "completed";
type FilterKey = "all" | StateGroup;
type QueueKey = "tts" | "design-voice" | "export";

function groupOf(state: string): StateGroup {
  switch (state) {
    case "active":
      return "active";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}

const groupLabel: Record<StateGroup, string> = {
  active: "进行中",
  pending: "等待中",
  completed: "完成",
  failed: "失败",
};

const filterOptions: SelectOption<FilterKey>[] = [
  { value: "all", label: "全部" },
  { value: "active", label: groupLabel.active },
  { value: "pending", label: groupLabel.pending },
  { value: "failed", label: groupLabel.failed },
  { value: "completed", label: groupLabel.completed },
];

function StatusIcon({ group }: { group: StateGroup }) {
  const className = cn(
    "size-4 shrink-0",
    group === "active" && "animate-spin text-primary-500",
    group === "pending" && "text-content-300",
    group === "completed" && "text-success",
    group === "failed" && "text-error",
  );
  if (group === "active") return <Loader2Icon className={className} />;
  if (group === "completed") return <CheckCircle2Icon className={className} />;
  if (group === "failed") return <XCircleIcon className={className} />;
  return <CircleDashedIcon className={className} />;
}

function JobRow({
  title,
  description,
  group,
  timestamp,
  failedReason,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  group: StateGroup;
  timestamp: number;
  failedReason: string | null;
  actions?: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 rounded-md border border-content-400/20 bg-base-300 px-3 py-2">
      <div className="mt-0.5">
        <StatusIcon group={group} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-content-100">{title}</span>
          <span className="shrink-0 text-xs text-content-400">{relativeTime(timestamp)}</span>
        </div>
        {description && <p className="mt-0.5 truncate text-xs text-content-400">{description}</p>}
        {group === "failed" && failedReason && (
          <p className="mt-1 line-clamp-2 text-xs break-all text-error">{failedReason}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </li>
  );
}

export default function TasksDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [queue, setQueue] = useState<QueueKey>("tts");

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      side="right"
      size="lg"
      title="后台任务"
      description="查看语音合成、声音设计和项目导出的任务状态"
    >
      <div className="-mt-2 mb-4">
        <Tabs<QueueKey>
          items={[
            { value: "tts", label: "语音合成" },
            { value: "design-voice", label: "声音设计" },
            { value: "export", label: "项目导出" },
          ]}
          value={queue}
          onChange={setQueue}
        />
      </div>
      {queue === "tts" ? (
        <TTSPanel open={open} />
      ) : queue === "design-voice" ? (
        <DesignPanel open={open} />
      ) : (
        <ExportPanel open={open} />
      )}
    </Drawer>
  );
}

function DesignPanel({ open }: { open: boolean }) {
  const fetchJobs = useServerFn(listDesignJobs);
  const { data, isPending, isError } = useQuery({
    queryKey: ["design-jobs"],
    queryFn: () => fetchJobs(),
    enabled: open,
    refetchInterval: open ? 1000 : false,
  });
  const [filter, setFilter] = useState<FilterKey>("all");
  if (isError && !data) return <p role="alert">声音设计任务加载失败</p>;
  if (!data) return <p role="status">正在加载声音设计任务…</p>;
  const { counts, jobs } = data;
  const visible = takeLatestPerGroup(jobs, filter);
  return (
    <PanelLayout
      filter={filter}
      onFilterChange={setFilter}
      counts={counts}
      total={Object.values(counts).reduce((sum, n) => sum + n, 0)}
      displayedCount={visible.length}
      loading={isPending}
      isEmpty={!visible.length}
      bulkAction={null}
    >
      {visible.map((job) => (
        <JobRow
          key={job.id}
          title={job.name ?? `声音设计 #${job.designId}`}
          description={groupLabel[groupOf(job.state)]}
          group={groupOf(job.state)}
          timestamp={job.finishedAt ?? job.processedAt ?? job.createdAt}
          failedReason={job.failedReason}
        />
      ))}
    </PanelLayout>
  );
}

function TTSPanel({ open }: { open: boolean }) {
  const { jobs, counts, loading } = useTTSJobsStream(open);
  const [filter, setFilter] = useState<FilterKey>("all");

  const qc = useQueryClient();
  const cancelFn = useServerFn(cancelTTSJob);
  const retryFn = useServerFn(retryTTSJob);
  const clearCompletedFn = useServerFn(clearCompletedJobs);
  const clearWaitingFn = useServerFn(clearWaitingJobs);
  const clearFailedFn = useServerFn(clearFailedJobs);
  const retryAllFailedFn = useServerFn(retryAllFailedJobs);

  const invalidateSummary = () => qc.invalidateQueries({ queryKey: ["tts-jobs-summary"] });

  const cancelMut = useMutation({
    mutationFn: (jobId: string) => cancelFn({ data: { jobId } }),
    onSuccess: invalidateSummary,
    onError: (err) =>
      toast.error({
        title: "操作失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });
  const retryMut = useMutation({
    mutationFn: (jobId: string) => retryFn({ data: { jobId } }),
    onSuccess: () => {
      invalidateSummary();
      toast.success("已加入重试");
    },
    onError: (err) =>
      toast.error({
        title: "重试失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });
  const clearCompletedMut = useMutation({
    mutationFn: () => clearCompletedFn(),
    onSuccess: ({ count }) =>
      toast.success(count > 0 ? `已清空 ${count} 条已完成任务` : "无已完成任务"),
    onError: (err) =>
      toast.error({
        title: "清空失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });
  const clearWaitingMut = useMutation({
    mutationFn: () => clearWaitingFn(),
    onSuccess: ({ count }) => {
      invalidateSummary();
      toast.success(count > 0 ? `已删除 ${count} 条排队任务` : "无排队任务");
    },
    onError: (err) =>
      toast.error({
        title: "删除失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });
  const retryAllFailedMut = useMutation({
    mutationFn: () => retryAllFailedFn(),
    onSuccess: ({ count }) => {
      invalidateSummary();
      toast.success(count > 0 ? `已重试 ${count} 条失败任务` : "无失败任务");
    },
    onError: (err) =>
      toast.error({
        title: "重试失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });
  const clearFailedMut = useMutation({
    mutationFn: () => clearFailedFn(),
    onSuccess: ({ count }) => {
      invalidateSummary();
      toast.success(count > 0 ? `已删除 ${count} 条失败任务` : "无失败任务");
    },
    onError: (err) =>
      toast.error({
        title: "删除失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const total = counts.active + counts.pending + counts.completed + counts.failed;
  const visibleJobs = takeLatestPerGroup(jobs, filter);

  function rowActions(job: TTSJobInfo): React.ReactNode {
    const group = groupOf(job.state);
    if (group === "active") {
      return (
        <Button
          variant="ghost"
          size="sm"
          shape="circle"
          onClick={() => cancelMut.mutate(job.id)}
          disabled={cancelMut.isPending}
          aria-label="停止"
          title="停止"
        >
          <SquareIcon />
        </Button>
      );
    }
    if (group === "pending") {
      return (
        <Button
          variant="ghost"
          size="sm"
          shape="circle"
          onClick={() => cancelMut.mutate(job.id)}
          disabled={cancelMut.isPending}
          aria-label="删除"
          title="从队列移除"
        >
          <XIcon />
        </Button>
      );
    }
    if (group === "failed") {
      return (
        <>
          <Button
            variant="ghost"
            size="sm"
            shape="circle"
            onClick={() => retryMut.mutate(job.id)}
            disabled={retryMut.isPending}
            aria-label="重试"
            title="重试"
          >
            <RefreshCwIcon />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            shape="circle"
            onClick={() => cancelMut.mutate(job.id)}
            disabled={cancelMut.isPending}
            aria-label="删除"
            title="删除"
          >
            <XIcon />
          </Button>
        </>
      );
    }
    return (
      <Button
        variant="ghost"
        size="sm"
        shape="circle"
        onClick={() => cancelMut.mutate(job.id)}
        disabled={cancelMut.isPending}
        aria-label="删除"
        title="删除"
      >
        <XIcon />
      </Button>
    );
  }

  function bulkAction(): React.ReactNode {
    return (
      <div className="flex items-center gap-1">
        {(filter === "all" || filter === "completed") && counts.completed > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => clearCompletedMut.mutate()}
            disabled={clearCompletedMut.isPending}
          >
            <Trash2Icon />
            清空完成
          </Button>
        )}
        {(filter === "all" || filter === "failed") && counts.failed > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => retryAllFailedMut.mutate()}
            disabled={retryAllFailedMut.isPending}
          >
            <RefreshCwIcon />
            全部重试
          </Button>
        )}
        {(filter === "all" || filter === "failed") && counts.failed > 0 && (
          <Button
            variant="danger"
            size="sm"
            onClick={() => clearFailedMut.mutate()}
            disabled={clearFailedMut.isPending}
          >
            <Trash2Icon />
            清空失败
          </Button>
        )}
        {(filter === "all" || filter === "pending") && counts.pending > 0 && (
          <Button
            variant="danger"
            size="sm"
            onClick={() => clearWaitingMut.mutate()}
            disabled={clearWaitingMut.isPending}
          >
            <Trash2Icon />
            取消全部
          </Button>
        )}
      </div>
    );
  }

  return (
    <PanelLayout
      filter={filter}
      onFilterChange={setFilter}
      counts={counts}
      total={total}
      displayedCount={visibleJobs.length}
      bulkAction={bulkAction()}
      loading={loading}
      isEmpty={visibleJobs.length === 0}
    >
      {visibleJobs.map((job) => (
        <JobRow
          key={job.id}
          title={`Segment #${job.segmentId}`}
          group={groupOf(job.state)}
          timestamp={job.finishedAt ?? job.processedAt ?? job.createdAt}
          failedReason={job.failedReason}
          actions={rowActions(job)}
        />
      ))}
    </PanelLayout>
  );
}

function ExportPanel({ open }: { open: boolean }) {
  const { jobs, counts, loading } = useExportJobsStream(open);
  const [filter, setFilter] = useState<FilterKey>("all");

  const qc = useQueryClient();
  const cancelFn = useServerFn(cancelExportJob);
  const clearCompletedFn = useServerFn(clearCompletedExportJobs);
  const clearWaitingFn = useServerFn(clearWaitingExportJobs);
  const clearFailedFn = useServerFn(clearFailedExportJobs);

  const invalidateSummary = () => qc.invalidateQueries({ queryKey: ["export-jobs-summary"] });

  const cancelMut = useMutation({
    mutationFn: (jobId: string) => cancelFn({ data: { jobId } }),
    onSuccess: invalidateSummary,
    onError: (err) =>
      toast.error({
        title: "操作失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });
  const clearCompletedMut = useMutation({
    mutationFn: () => clearCompletedFn(),
    onSuccess: ({ count }) =>
      toast.success(count > 0 ? `已清空 ${count} 条已完成任务` : "无已完成任务"),
    onError: (err) =>
      toast.error({
        title: "清空失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });
  const clearWaitingMut = useMutation({
    mutationFn: () => clearWaitingFn(),
    onSuccess: ({ count }) => {
      invalidateSummary();
      toast.success(count > 0 ? `已删除 ${count} 条排队任务` : "无排队任务");
    },
    onError: (err) =>
      toast.error({
        title: "删除失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });
  const clearFailedMut = useMutation({
    mutationFn: () => clearFailedFn(),
    onSuccess: ({ count }) => {
      invalidateSummary();
      toast.success(count > 0 ? `已删除 ${count} 条失败任务` : "无失败任务");
    },
    onError: (err) =>
      toast.error({
        title: "删除失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const total = counts.active + counts.pending + counts.completed + counts.failed;
  const visibleJobs = takeLatestPerGroup(jobs, filter);

  function rowActions(job: ExportJobInfo): React.ReactNode {
    const group = groupOf(job.state);
    if (group === "active" || group === "pending") {
      return (
        <Button
          variant="ghost"
          size="sm"
          shape="circle"
          onClick={() => cancelMut.mutate(job.id)}
          disabled={cancelMut.isPending}
          aria-label={group === "active" ? "停止" : "删除"}
          title={group === "active" ? "停止" : "从队列移除"}
        >
          {group === "active" ? <SquareIcon /> : <XIcon />}
        </Button>
      );
    }
    return (
      <Button
        variant="ghost"
        size="sm"
        shape="circle"
        onClick={() => cancelMut.mutate(job.id)}
        disabled={cancelMut.isPending}
        aria-label="删除"
        title="删除"
      >
        <XIcon />
      </Button>
    );
  }

  function bulkAction(): React.ReactNode {
    return (
      <div className="flex items-center gap-1">
        {(filter === "all" || filter === "pending") && counts.pending > 0 && (
          <Button
            variant="danger"
            size="sm"
            onClick={() => clearWaitingMut.mutate()}
            disabled={clearWaitingMut.isPending}
          >
            <Trash2Icon />
            取消全部
          </Button>
        )}
        {(filter === "all" || filter === "failed") && counts.failed > 0 && (
          <Button
            variant="danger"
            size="sm"
            onClick={() => clearFailedMut.mutate()}
            disabled={clearFailedMut.isPending}
          >
            <Trash2Icon />
            清空失败
          </Button>
        )}
        {(filter === "all" || filter === "completed") && counts.completed > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => clearCompletedMut.mutate()}
            disabled={clearCompletedMut.isPending}
          >
            <Trash2Icon />
            清空完成
          </Button>
        )}
      </div>
    );
  }

  return (
    <PanelLayout
      filter={filter}
      onFilterChange={setFilter}
      counts={counts}
      total={total}
      displayedCount={visibleJobs.length}
      bulkAction={bulkAction()}
      loading={loading}
      isEmpty={visibleJobs.length === 0}
    >
      {visibleJobs.map((job) => (
        <JobRow
          key={job.id}
          title={`项目 #${job.projectId}`}
          description={`${scopeLabel(job.scope)} · ${job.format.toUpperCase()}`}
          group={groupOf(job.state)}
          timestamp={job.finishedAt ?? job.processedAt ?? job.createdAt}
          failedReason={job.failedReason}
          actions={rowActions(job)}
        />
      ))}
    </PanelLayout>
  );
}

function PanelLayout({
  filter,
  onFilterChange,
  counts,
  total,
  displayedCount,
  bulkAction,
  loading,
  isEmpty,
  children,
}: {
  filter: FilterKey;
  onFilterChange: (next: FilterKey) => void;
  counts: Record<StateGroup, number>;
  total: number;
  displayedCount: number;
  bulkAction: React.ReactNode;
  loading: boolean;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  const filterTotal = filter === "all" ? total : (counts[filter as StateGroup] ?? 0);
  const filterLabel = filterOptions.find((o) => o.value === filter)?.label ?? "全部";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Select<FilterKey>
          options={filterOptions.map((opt) => ({
            value: opt.value,
            label:
              opt.value === "all"
                ? `${opt.label}（${total}）`
                : `${opt.label}（${counts[opt.value as StateGroup] ?? 0}）`,
          }))}
          value={filter}
          onChange={(v) => onFilterChange(v as FilterKey)}
        />
        {bulkAction}
      </div>
      {(loading && total === 0) || isEmpty ? (
        <div className="flex h-60 flex-col items-center justify-center gap-3 text-content-400">
          {filter === "completed" ? (
            <DownloadIcon className="size-10" />
          ) : (
            <ListChecksIcon className="size-10" />
          )}
          <p className="text-sm">
            {filter === "all" ? "暂无任务" : `暂无${filterLabel.replace(/（.*）/, "")}的任务`}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">{children}</ul>
      )}
      {!isEmpty && (
        <p className="text-xs text-content-400">
          显示 {displayedCount} 条{displayedCount < filterTotal && ` / 共 ${filterTotal} 条`}
        </p>
      )}
    </div>
  );
}

// Drawer caps every state group at 20 most-recent rows. The server already
// limits completed/failed to ~20, but live (active + pending) is fetched in
// bulk so other consumers can read the full set — the drawer just slices
// for display. `jobs` arrives sorted desc by createdAt, so taking the
// first N per group is equivalent to "latest N".
const PER_GROUP_DISPLAY = 20;

function takeLatestPerGroup<T extends { state: string; createdAt: number }>(
  jobs: T[],
  filter: FilterKey,
): T[] {
  if (filter !== "all") {
    return jobs.filter((j) => groupOf(j.state) === filter).slice(0, PER_GROUP_DISPLAY);
  }
  const byGroup: Record<StateGroup, T[]> = {
    active: [],
    pending: [],
    failed: [],
    completed: [],
  };
  for (const j of jobs) {
    const g = groupOf(j.state);
    if (byGroup[g].length < PER_GROUP_DISPLAY) byGroup[g].push(j);
  }
  return [...byGroup.active, ...byGroup.pending, ...byGroup.failed, ...byGroup.completed].sort(
    (a, b) => b.createdAt - a.createdAt,
  );
}

function scopeLabel(scope: ExportJobInfo["scope"]): string {
  if (scope === "chapter") return "本章节";
  if (scope === "all-merged") return "全部章节（拼接）";
  return "全部章节（分轨）";
}
