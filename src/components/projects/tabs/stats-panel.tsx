import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import SectionCard from "@/components/settings/section-card";
import Skeleton from "@/components/ui/skeleton";
import { t } from "@/i18n";
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
      <SectionCard
        title={t("Project overview")}
        description={t("Project assets and generation status")}
      >
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
    <SectionCard
      title={t("Project overview")}
      description={t("Project assets and generation status")}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard label={t("Chapter")}>
          <StatValue value={stats.chapterCount} suffix={t("items total")} />
        </StatCard>
        <StatCard label={t("Segments")}>
          <StatValue value={stats.segments.total} suffix={t("items total")} />
          <StatLines>
            <StatLine label={t("Generated")} value={t("{0} items", stats.segments.generated)} />
            {stats.segments.ungenerated > 0 && (
              <StatLine
                label={t("Not generated")}
                value={t("{0} items", stats.segments.ungenerated)}
                tone="warning"
              />
            )}
          </StatLines>
        </StatCard>
        <StatCard label={t("Character")}>
          <StatValue value={stats.narrators.total} suffix={t("items total")} />
          <StatLines>
            <StatLine label={t("In use")} value={t("{0} items", stats.narrators.used)} />
            {stats.narrators.unused > 0 && (
              <StatLine
                label={t("Unused")}
                value={t("{0} items", stats.narrators.unused)}
                tone="muted"
              />
            )}
          </StatLines>
        </StatCard>
        <StatCard label={t("Speech synthesis")}>
          <StatValue value={stats.ttsGenerations.total} suffix={t("entries")} />
          <StatLines>
            <StatLine
              label={t("In use")}
              value={t(
                "{0} entries · {1} · {2}",
                stats.ttsGenerations.used.count,
                formatBytes(stats.ttsGenerations.used.size),
                formatDuration(stats.ttsGenerations.used.duration),
              )}
            />
            {stats.ttsGenerations.candidate.count > 0 && (
              <StatLine
                label={t("Alternate")}
                value={t(
                  "{0} entries · {1}",
                  stats.ttsGenerations.candidate.count,
                  formatBytes(stats.ttsGenerations.candidate.size),
                )}
                tone="muted"
              />
            )}
            {stats.ttsGenerations.orphan.count > 0 && (
              <StatLine
                label={t("Orphaned")}
                value={t(
                  "{0} entries · {1}",
                  stats.ttsGenerations.orphan.count,
                  formatBytes(stats.ttsGenerations.orphan.size),
                )}
                tone="warning"
              />
            )}
          </StatLines>
        </StatCard>
        <StatCard label={t("Exports")}>
          <StatValue value={stats.exports.count} suffix={t("items total")} />
          <StatLines>
            <StatLine label={t("Total size")} value={formatBytes(stats.exports.size)} />
            {stats.exports.outdated.count > 0 && (
              <StatLine
                label={t("Outdated")}
                value={t(
                  "{0} items · {1}",
                  stats.exports.outdated.count,
                  formatBytes(stats.exports.outdated.size),
                )}
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
