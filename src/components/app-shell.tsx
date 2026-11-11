import { useQueries } from "@tanstack/react-query";
import { Link, useMatches } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRightIcon, ListChecksIcon, MicIcon, SettingsIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import TasksDrawer from "@/components/tasks-drawer";
import Button from "@/components/ui/button";
import Tooltip from "@/components/ui/tooltip";
import VoxifyLogo from "@/components/voxify-logo";
import { getExportJobsSummary } from "@/lib/export.functions";
import { getTTSJobsSummary } from "@/lib/mq.functions";
import { getDesignJobsSummary } from "@/lib/voice-designs.functions";

const activeLinkClass = "bg-base-400 text-content-100";

function useProjectName(): string | null {
  const matches = useMatches();
  for (const match of matches) {
    const data = match.loaderData as { projectName?: string } | undefined;
    if (data?.projectName) return data.projectName;
  }
  return null;
}

export default function AppShell({ children }: { children: ReactNode }) {
  const [tasksOpen, setTasksOpen] = useState(false);
  const projectName = useProjectName();

  const fetchTTSSummary = useServerFn(getTTSJobsSummary);
  const fetchExportSummary = useServerFn(getExportJobsSummary);
  const fetchDesignSummary = useServerFn(getDesignJobsSummary);
  const summaries = useQueries({
    queries: [
      {
        queryKey: ["design-jobs-summary"],
        queryFn: () => fetchDesignSummary(),
        refetchInterval: 3000,
      },
      {
        queryKey: ["tts-jobs-summary"] as const,
        queryFn: () => fetchTTSSummary(),
        refetchInterval: 3000,
        refetchOnWindowFocus: true,
      },
      {
        queryKey: ["export-jobs-summary"] as const,
        queryFn: () => fetchExportSummary(),
        refetchInterval: 3000,
        refetchOnWindowFocus: true,
      },
    ],
  });
  const hasRunning = summaries.some((query) => query.data?.hasRunning);
  const hasFailed = summaries.some((query) => query.data?.hasFailed);

  const tooltip = hasRunning ? "后台任务（进行中）" : hasFailed ? "后台任务（有失败）" : "后台任务";

  return (
    <div className="flex h-screen min-h-0 flex-col">
      <header className="sticky top-0 z-40 border-b border-content-400/20 bg-base-200/80 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/projects"
              className="flex shrink-0 items-center gap-2 text-content-100 outline-none"
            >
              <VoxifyLogo className="size-6" />
              <span className="text-xl font-semibold tracking-tight">Voxify</span>
            </Link>
            {projectName && (
              <>
                <ChevronRightIcon className="size-4 shrink-0 text-content-400" />
                <span className="truncate text-sm text-content-200">{projectName}</span>
              </>
            )}
          </div>
          <nav className="flex items-center gap-1">
            <Tooltip content="语音库">
              <Button variant="ghost" size="lg" shape="square" asChild>
                <Link to="/voices" aria-label="语音库" activeProps={{ className: activeLinkClass }}>
                  <MicIcon />
                </Link>
              </Button>
            </Tooltip>
            <Tooltip content="设置">
              <Button variant="ghost" size="lg" shape="square" asChild>
                <Link to="/settings" aria-label="设置" activeProps={{ className: activeLinkClass }}>
                  <SettingsIcon />
                </Link>
              </Button>
            </Tooltip>
            <Tooltip content={tooltip}>
              <div className="relative inline-flex">
                <Button
                  variant="ghost"
                  size="lg"
                  shape="square"
                  aria-label="后台任务"
                  onClick={() => setTasksOpen(true)}
                >
                  <ListChecksIcon />
                </Button>
                {hasRunning ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute top-1.5 right-1.5 inline-flex size-2"
                  >
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-info opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-info" />
                  </span>
                ) : hasFailed ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute top-1.5 right-1.5 size-2 rounded-full bg-error"
                  />
                ) : null}
              </div>
            </Tooltip>
          </nav>
        </div>
      </header>
      <main className="min-h-0 flex-1">{children}</main>
      <TasksDrawer open={tasksOpen} onOpenChange={setTasksOpen} />
    </div>
  );
}
