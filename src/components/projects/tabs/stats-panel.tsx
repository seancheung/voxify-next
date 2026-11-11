import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import SectionCard from "@/components/settings/section-card";
import Skeleton from "@/components/ui/skeleton";
import { getProjectStats, type ProjectStats } from "@/lib/projects.functions";
import { cn } from "@/utils/cn";

export default function StatsPanel({ projectId }: { projectId: number }) {
  const fetchStats = useServerFn(getProjectStats);

  const { data: stats } = useQuery({
    queryKey: ["project-stats", projectId] as const,
    queryFn: () => fetchStats({ data: { projectId } }),
  });

  if (!stats) {
    return <StatsPanelSkeleton />;
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-6">
      <StatsSection stats={stats} />
    </div>
  );
}

function StatsPanelSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-6">
      <SectionCard title="项目概览" description="统计当前项目的资产与生成状态">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-content-400/15 bg-base-300 p-4">
      <Skeleton className="h-3 w-12" />
      <Skeleton className="h-7 w-16" />
      <Skeleton className="mt-1 h-3 w-32" />
      <Skeleton className="h-3 w-28" />
    </div>
  );
}

function StatsSection({ stats }: { stats: ProjectStats }) {
  return (
    <SectionCard title="项目概览" description="统计当前项目的资产与生成状态">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard label="章节">
          <StatValue value={stats.chapterCount} suffix="个" />
        </StatCard>
        <StatCard label="段落">
          <StatValue value={stats.segments.total} suffix="个" />
          <StatLines>
            <StatLine label="已生成" value={`${stats.segments.generated} 个`} />
            {stats.segments.ungenerated > 0 && (
              <StatLine label="未生成" value={`${stats.segments.ungenerated} 个`} tone="warning" />
            )}
          </StatLines>
        </StatCard>
        <StatCard label="角色">
          <StatValue value={stats.narrators.total} suffix="个" />
          <StatLines>
            <StatLine label="使用中" value={`${stats.narrators.used} 个`} />
            {stats.narrators.unused > 0 && (
              <StatLine label="未使用" value={`${stats.narrators.unused} 个`} tone="muted" />
            )}
          </StatLines>
        </StatCard>
        <StatCard label="语音合成">
          <StatValue value={stats.ttsGenerations.total} suffix="条" />
          <StatLines>
            <StatLine
              label="使用中"
              value={`${stats.ttsGenerations.used.count} 条 · ${formatBytes(stats.ttsGenerations.used.size)} · ${formatDuration(stats.ttsGenerations.used.duration)}`}
            />
            {stats.ttsGenerations.candidate.count > 0 && (
              <StatLine
                label="候选"
                value={`${stats.ttsGenerations.candidate.count} 条 · ${formatBytes(stats.ttsGenerations.candidate.size)}`}
                tone="muted"
              />
            )}
            {stats.ttsGenerations.orphan.count > 0 && (
              <StatLine
                label="无主"
                value={`${stats.ttsGenerations.orphan.count} 条 · ${formatBytes(stats.ttsGenerations.orphan.size)}`}
                tone="warning"
              />
            )}
          </StatLines>
        </StatCard>
        <StatCard label="导出">
          <StatValue value={stats.exports.count} suffix="个" />
          <StatLines>
            <StatLine label="总体积" value={formatBytes(stats.exports.size)} />
            {stats.exports.outdated.count > 0 && (
              <StatLine
                label="过时"
                value={`${stats.exports.outdated.count} 个 · ${formatBytes(stats.exports.outdated.size)}`}
                tone="muted"
              />
            )}
          </StatLines>
        </StatCard>
      </div>
    </SectionCard>
  );
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-content-400/15 bg-base-300 p-4">
      <span className="text-xs text-content-300">{label}</span>
      {children}
    </div>
  );
}

function StatValue({ value, suffix }: { value: number; suffix?: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="font-mono text-2xl text-content-100">{value}</span>
      {suffix && <span className="text-xs text-content-400">{suffix}</span>}
    </div>
  );
}

function StatLines({ children }: { children: React.ReactNode }) {
  return <ul className="mt-1 flex flex-col gap-0.5 text-xs">{children}</ul>;
}

function StatLine({
  label,
  value,
  tone = "info",
}: {
  label: string;
  value: string;
  tone?: "info" | "warning" | "muted";
}) {
  return (
    <li className="flex items-center justify-between gap-2 text-content-300">
      <span
        className={cn(tone === "warning" && "text-warning", tone === "muted" && "text-content-400")}
      >
        {label}
      </span>
      <span className="font-mono text-content-200">{value}</span>
    </li>
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

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0:00";
  const totalSeconds = Math.round(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}
