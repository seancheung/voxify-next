import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, notFound, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeftToLineIcon,
  ArrowRightFromLineIcon,
  DownloadIcon,
  FileIcon,
  LayoutDashboardIcon,
  ListMusicIcon,
  SettingsIcon,
  UsersRoundIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { z } from "zod";
import ChapterList from "@/components/projects/chapter-list";
import { PROJECT_TABS, type ProjectTab, ProjectTabPanel } from "@/components/projects/tabs";
import TabIconItem from "@/components/tab-icon-item";
import Button from "@/components/ui/button";
import Tabs, { type TabItem } from "@/components/ui/tab";
import {
  type ChapterListItem,
  getProject,
  listChapters,
  touchProjectLastOpened,
} from "@/lib/chapters.functions";

const searchSchema = z.object({
  ch: z.coerce.number().int().positive().optional(),
  tab: z.enum(PROJECT_TABS).optional().catch(undefined),
});

export const Route = createFileRoute("/_app/projects/$id")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ ch: search.ch, tab: search.tab }),
  loader: async ({ context, params, deps }) => {
    const projectId = Number(params.id);
    if (!Number.isFinite(projectId) || projectId <= 0) {
      throw notFound();
    }
    const [project, chapters] = await Promise.all([
      context.queryClient.ensureQueryData(projectQueryOptions(projectId)),
      context.queryClient.ensureQueryData({
        ...chaptersQueryOptions(projectId),
        queryFn: () => listChapters({ data: { projectId } }),
      }),
    ]);
    if (!project) throw notFound();
    if (chapters.length > 0) {
      const exists = deps.ch != null && chapters.some((c) => c.id === deps.ch);
      if (!exists) {
        throw redirect({
          to: "/projects/$id",
          params: { id: String(projectId) },
          search: { ch: chapters[0].id, tab: deps.tab },
          replace: true,
        });
      }
    }
    return { projectName: project.name };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  const { ch, tab } = Route.useSearch();
  const projectId = Number(id);
  const chapterId = ch ?? null;
  const activeTab = tab ?? PROJECT_DEFAULT_TAB;

  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchChapters = useServerFn(listChapters);
  const touchLastOpened = useServerFn(touchProjectLastOpened);

  const [panelOpen, setPanelOpen] = useState(true);

  useEffect(() => {
    void touchLastOpened({ data: { id: projectId } }).then(() => {
      qc.invalidateQueries({ queryKey: ["projects"], refetchType: "none" });
    });
  }, [projectId, touchLastOpened, qc]);

  function handleTabChange(next: ProjectTab) {
    navigate({
      to: "/projects/$id",
      params: { id: String(projectId) },
      search: (prev) => ({
        ...prev,
        tab: next === PROJECT_DEFAULT_TAB ? undefined : next,
      }),
      replace: true,
    });
  }

  const { data: chapters = [] } = useQuery({
    ...chaptersQueryOptions(projectId),
    queryFn: () => fetchChapters({ data: { projectId } }),
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: only redirect when selection state changes
  useEffect(() => {
    if (chapters.length === 0) return;
    const exists = chapterId != null && chapters.some((c) => c.id === chapterId);
    if (!exists) {
      navigate({
        to: "/projects/$id",
        params: { id: String(projectId) },
        search: (prev) => ({ ...prev, ch: chapters[0].id }),
        replace: true,
      });
    }
  }, [chapters, chapterId, projectId]);

  const selectedChapter =
    chapterId != null ? (chapters.find((c) => c.id === chapterId) ?? null) : null;

  function handleSelectChapter(id: number) {
    navigate({
      to: "/projects/$id",
      params: { id: String(projectId) },
      search: (prev) => ({ ...prev, ch: id }),
    });
  }

  function handleChapterCreated(chapter: ChapterListItem) {
    navigate({
      to: "/projects/$id",
      params: { id: String(projectId) },
      search: (prev) => ({ ...prev, ch: chapter.id }),
    });
  }

  return (
    <div className="flex h-full min-h-0">
      <AnimatePresence initial={false}>
        {panelOpen && (
          <motion.aside
            key="chapters-panel"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 264, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="shrink-0 overflow-hidden border-r border-content-400/15 bg-base-200"
          >
            <div className="h-full w-66 min-w-0">
              <ChapterList
                projectId={projectId}
                chapters={chapters}
                selectedId={chapterId}
                onSelect={handleSelectChapter}
                onCreated={handleChapterCreated}
              />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
      <motion.main layout className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-content-400/15 bg-base-200 px-3">
          <Button
            variant="ghost"
            size="sm"
            shape="square"
            aria-label={panelOpen ? "折叠章节面板" : "展开章节面板"}
            onClick={() => setPanelOpen((v) => !v)}
          >
            {panelOpen ? <ArrowLeftToLineIcon /> : <ArrowRightFromLineIcon />}
          </Button>
          <Tabs
            items={TABS}
            value={activeTab}
            onChange={handleTabChange}
            className="h-full border-b-0 [&>button]:h-full"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-6">
          <ProjectTabPanel tab={activeTab} projectId={projectId} chapter={selectedChapter} />
        </div>
      </motion.main>
    </div>
  );
}

const PROJECT_DEFAULT_TAB = "stats" as const;

const TABS: TabItem<ProjectTab>[] = [
  {
    value: "stats",
    label: <TabIconItem icon={LayoutDashboardIcon} title="概览" />,
  },
  {
    value: "text",
    label: <TabIconItem icon={FileIcon} title="文本" />,
  },
  {
    value: "generate",
    label: <TabIconItem icon={ListMusicIcon} title="生成" />,
  },
  {
    value: "narrators",
    label: <TabIconItem icon={UsersRoundIcon} title="角色" />,
  },
  { value: "export", label: <TabIconItem icon={DownloadIcon} title="导出" /> },
  {
    value: "settings",
    label: <TabIconItem icon={SettingsIcon} title="设置" />,
  },
];

function projectQueryOptions(projectId: number) {
  return {
    queryKey: ["project", projectId] as const,
    queryFn: () => getProject({ data: { id: projectId } }),
  };
}

function chaptersQueryOptions(projectId: number) {
  return {
    queryKey: ["chapters", projectId] as const,
    queryFn: () => listChapters({ data: { projectId } }),
  };
}
