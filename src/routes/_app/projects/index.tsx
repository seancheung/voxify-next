import {
  infiniteQueryOptions,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { FileUpIcon, PlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import PageHeader from "@/components/page-header";
import ImportProjectDialog from "@/components/projects/import-project-dialog";
import NewProjectDialog from "@/components/projects/new-project-dialog";
import ProjectCard from "@/components/projects/project-card";
import ProjectsEmptyState from "@/components/projects/projects-empty-state";
import ProjectsToolbar, {
  type ProjectsSortKey,
  type ProjectsStatusFilter,
} from "@/components/projects/projects-toolbar";
import Button from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useDebouncedState } from "@/hooks/use-debounced";
import { t } from "@/i18n";
import {
  deleteProject,
  duplicateProject,
  type ListProjectsResult,
  listProjects,
  restoreProject,
} from "@/lib/projects.functions";

export const Route = createFileRoute("/_app/projects/")({
  loader: ({ context }) =>
    context.queryClient.ensureInfiniteQueryData(
      projectsQueryOptions({
        sort: PROJECTS_DEFAULT_SORT,
        status: PROJECTS_DEFAULT_STATUS,
        search: "",
      }),
    ),
  component: RouteComponent,
});

function RouteComponent() {
  const list = useServerFn(listProjects);
  const remove = useServerFn(deleteProject);
  const restore = useServerFn(restoreProject);
  const dup = useServerFn(duplicateProject);
  const qc = useQueryClient();

  const [sort, setSort] = useState<ProjectsSortKey>(PROJECTS_DEFAULT_SORT);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PROJECTS_SORT_STORAGE_KEY);
      if (saved === "lastOpenedAt" || saved === "createdAt" || saved === "name") {
        setSort(saved);
      }
    } catch {
      // Browser storage may be disabled.
    }
  }, []);

  function changeSort(value: ProjectsSortKey) {
    setSort(value);
    try {
      localStorage.setItem(PROJECTS_SORT_STORAGE_KEY, value);
    } catch {
      // Keep the selection usable for this visit.
    }
  }

  const [status, setStatus] = useState<ProjectsStatusFilter>(PROJECTS_DEFAULT_STATUS);
  const [query, debouncedQueryRaw, setQuery] = useDebouncedState("", 250);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const debouncedQuery = debouncedQueryRaw.trim();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...projectsQueryOptions({ sort, status, search: debouncedQuery }),
    queryFn: ({ pageParam }) =>
      list({
        data: {
          cursor: pageParam,
          sort,
          status,
          search: debouncedQuery || undefined,
          limit: PAGE_SIZE,
        },
      }),
  });

  const projects = data?.pages.flatMap((p) => p.items) ?? [];
  const loadedCount = projects.length;
  const isFiltered = !!debouncedQuery || status !== "all";

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll-to-top should fire when filter inputs change
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [sort, status, debouncedQuery]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const restoreMut = useMutation({
    mutationFn: (id: number) => restore({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err) =>
      toast.error({
        title: t("Restore failed"),
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const removeMut = useMutation({
    mutationFn: (id: number) => remove({ data: { id } }),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success({
        title: t("Project deleted"),
        duration: 8000,
        action: {
          label: t("Undo"),
          onClick: () => restoreMut.mutate(id),
        },
      });
    },
    onError: (err) =>
      toast.error({
        title: t("Deletion failed"),
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const dupMut = useMutation({
    mutationFn: (id: number) => dup({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success(t("Project duplicated"));
    },
    onError: (err) =>
      toast.error({
        title: t("Duplication failed"),
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader
        title={t("Project")}
        description={
          hasNextPage
            ? t("Loaded {0} voices. Scroll for more.", loadedCount)
            : t("{0} projects", loadedCount)
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setImporting(true)}>
              <FileUpIcon />
              {t("Import content")}
            </Button>
            <Button onClick={() => setCreating(true)}>
              <PlusIcon />
              {t("New project")}
            </Button>
          </>
        }
      />
      <ProjectsToolbar
        query={query}
        onQueryChange={setQuery}
        status={status}
        onStatusChange={setStatus}
        sort={sort}
        onSortChange={changeSort}
      />
      {projects.length === 0 ? (
        <ProjectsEmptyState hasFilters={isFiltered} onCreate={() => setCreating(true)} />
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-4">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onDelete={removeMut.mutate}
                onDuplicate={dupMut.mutate}
              />
            ))}
          </div>
          <div ref={sentinelRef} className="h-px" aria-hidden="true" />
          {isFetchingNextPage && (
            <div className="py-6 text-center text-xs text-content-400">{t("Loading…")}</div>
          )}
          {!hasNextPage && projects.length >= PAGE_SIZE && (
            <div className="py-6 text-center text-xs text-content-400">{t("End of list")}</div>
          )}
        </>
      )}
      <NewProjectDialog open={creating} onOpenChange={setCreating} />
      <ImportProjectDialog open={importing} onOpenChange={setImporting} />
    </div>
  );
}

const PAGE_SIZE = 24;
const PROJECTS_DEFAULT_SORT: ProjectsSortKey = "lastOpenedAt";
const PROJECTS_SORT_STORAGE_KEY = "voxify:projects:sort";
const PROJECTS_DEFAULT_STATUS: ProjectsStatusFilter = "all";

function projectsQueryOptions(params: {
  sort: ProjectsSortKey;
  status: ProjectsStatusFilter;
  search: string;
}) {
  const { sort, status, search } = params;
  return infiniteQueryOptions({
    queryKey: ["projects", { sort, status, search }] as const,
    queryFn: ({ pageParam }) =>
      listProjects({
        data: {
          cursor: pageParam,
          sort,
          status,
          search: search || undefined,
          limit: PAGE_SIZE,
        },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: ListProjectsResult) => last.nextCursor ?? undefined,
  });
}
