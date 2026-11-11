import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileIcon, FolderIcon, Loader2Icon, PauseIcon, PlayIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import SectionCard from "@/components/settings/section-card";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import Skeleton from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import {
  clearCompletedQueueJobs,
  getQueuesStatus,
  type QueueKey,
  type QueueStatus,
  queueKeys,
  setQueuePaused,
} from "@/lib/mq.functions";
import { getGlobalStats } from "@/lib/projects.functions";

const queueLabels: Record<QueueKey, string> = {
  tts: "语音合成",
  "design-voice": "声音设计",
  export: "项目导出",
};

export default function GeneralStatsSection() {
  const fetchStats = useServerFn(getGlobalStats);
  const { data: stats } = useQuery({
    queryKey: ["global-stats"],
    queryFn: () => fetchStats(),
  });
  return (
    <SectionCard title="统计信息" description="项目与音频资源的整体使用情况">
      <div className="grid gap-3 md:grid-cols-2">
        <StatCard
          label="项目数量"
          value={stats ? `${stats.projects.total}` : null}
          sub={stats && stats.projects.deleted > 0 ? `已删除 ${stats.projects.deleted}` : undefined}
          icon={<FolderIcon />}
        />
        <StatCard
          label="文件数量"
          value={stats ? `${stats.files.count}` : null}
          sub={stats ? formatBytes(stats.files.size) : undefined}
          icon={<FileIcon />}
        />
      </div>
    </SectionCard>
  );
}

export function TaskManagementSection() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const qc = useQueryClient();
  const clearJobs = useServerFn(clearCompletedQueueJobs);
  const clear = useMutation({
    mutationFn: () => clearJobs(),
    onSuccess: ({ count }) => {
      setConfirmOpen(false);
      toast.success(count ? `已清空 ${count} 条已完成任务` : "无已完成任务");
      qc.invalidateQueries({ queryKey: ["queues-status"] });
      qc.invalidateQueries({ queryKey: ["design-jobs"] });
    },
    onError: (err) => toast.error({ title: "清空失败", description: err.message }),
  });
  const fetchQueues = useServerFn(getQueuesStatus);
  const { data: queues } = useQuery({
    queryKey: ["queues-status"],
    queryFn: () => fetchQueues(),
    refetchInterval: 5_000,
  });
  return (
    <SectionCard
      title="任务管理"
      actions={
        <Button variant="ghost" onClick={() => setConfirmOpen(true)}>
          清空已完成
        </Button>
      }
    >
      <div className="grid gap-3 md:grid-cols-3">
        {queueKeys.map((queue) => (
          <QueueCard key={queue} queue={queue} status={queues?.[queue] ?? null} />
        ))}
      </div>
      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        closable={!clear.isPending}
        size="sm"
        title="清空已完成任务？"
        description="将清空语音合成、声音设计和项目导出队列中的已完成任务记录。生成的音频和导出文件会保留。"
        footer={
          <>
            <Button
              variant="ghost"
              disabled={clear.isPending}
              onClick={() => setConfirmOpen(false)}
            >
              取消
            </Button>
            <Button disabled={clear.isPending} onClick={() => clear.mutate()}>
              {clear.isPending ? "清空中…" : "确认清空"}
            </Button>
          </>
        }
      />
    </SectionCard>
  );
}

function QueueCard({ queue, status }: { queue: QueueKey; status: QueueStatus | null }) {
  const qc = useQueryClient();
  const setPaused = useServerFn(setQueuePaused);
  const label = `${queueLabels[queue]}任务队列`;
  const pauseMut = useMutation({
    mutationFn: (paused: boolean) => setPaused({ data: { queue, paused } }),
    onSuccess: ({ paused }) => {
      toast.success(`已${paused ? "暂停" : "恢复"}${label}`);
      return qc.invalidateQueries({ queryKey: ["queues-status"] });
    },
    onError: (err) => toast.error({ title: "操作失败", description: err.message }),
  });
  const value = !status
    ? null
    : status.paused
      ? "已暂停"
      : status.running > 0
        ? `运行中 · ${status.running}`
        : "空闲";
  const sub = status && status.failed > 0 ? `失败 ${status.failed}` : undefined;

  return (
    <StatCard
      label={label}
      value={value}
      sub={sub}
      action={
        <Button
          variant="ghost"
          size="sm"
          disabled={!status || pauseMut.isPending}
          onClick={() => status && pauseMut.mutate(!status.paused)}
        >
          {pauseMut.isPending ? (
            <Loader2Icon className="animate-spin" />
          ) : status?.paused ? (
            <PlayIcon />
          ) : (
            <PauseIcon />
          )}
          {status?.paused ? "恢复" : "暂停"}
        </Button>
      }
    />
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  action,
}: {
  label: string;
  value: string | null;
  sub?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-content-400/15 bg-base-300 p-4">
      <div className="flex items-center justify-between gap-2 text-xs text-content-300">
        <span className="inline-flex items-center gap-1.5 icon:size-3.5">
          {icon}
          {label}
        </span>
        {action}
      </div>
      {value == null ? (
        <Skeleton className="h-8 w-16" />
      ) : (
        <div className="text-2xl font-semibold text-content-100">{value}</div>
      )}
      {sub ? <div className="text-xs text-content-400">{sub}</div> : null}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  const formatted = value >= 10 || i === 0 ? value.toFixed(0) : value.toFixed(1);
  return `${formatted} ${units[i]}`;
}
