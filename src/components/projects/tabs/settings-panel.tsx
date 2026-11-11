import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ImageIcon, Loader2Icon, RotateCcwIcon, Trash2Icon, TrashIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type z from "zod";
import { useAppForm, useAutoSubmit } from "@/components/form";
import ProjectCover from "@/components/projects/project-cover";
import SectionCard from "@/components/settings/section-card";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import type { SelectOption } from "@/components/ui/select";
import Skeleton from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { DEFAULT_LOCALE, LOCALES } from "@/constants/locale";
import {
  type ChapterListItem,
  type DeletedChapterListItem,
  deleteChapter,
  getProject,
  listDeletedChapters,
  purgeChapter,
  restoreChapter,
  updateChapter,
  updateChapterSchema,
} from "@/lib/chapters.functions";
import { getAppConfig } from "@/lib/configs.functions";
import { listLLMModels } from "@/lib/llm-models.functions";
import {
  clearCandidateGenerations,
  deleteOrphanGenerations,
  deleteOutdatedExportHistory,
  deleteProject,
  deleteUnusedNarrators,
  getProjectStats,
  type ProjectStats,
  restoreProject,
  updateProject,
  updateProjectSchema,
  uploadProjectCover,
} from "@/lib/projects.functions";
import { listPrompts } from "@/lib/prompts.functions";
import { cn } from "@/utils/cn";
import { relativeTime } from "@/utils/datetime";

type ProjectFormValues = z.input<typeof updateProjectSchema>;
type ChapterFormValues = z.input<typeof updateChapterSchema>;

const localeOptions: SelectOption<string | null>[] = LOCALES.map((l) => ({
  value: l.value,
  label: l.label,
}));

export default function SettingsPanel({
  projectId,
  chapter,
}: {
  projectId: number;
  chapter: ChapterListItem | null;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fetchProject = useServerFn(getProject);
  const fetchStats = useServerFn(getProjectStats);
  const fetchLLM = useServerFn(listLLMModels);
  const fetchPrompts = useServerFn(listPrompts);
  const fetchConfig = useServerFn(getAppConfig);
  const saveProject = useServerFn(updateProject);
  const removeProjectFn = useServerFn(deleteProject);
  const restoreProjectFn = useServerFn(restoreProject);

  const [
    { data: project },
    { data: stats },
    { data: llmList = [] },
    { data: promptList = [] },
    { data: appConfig },
  ] = useQueries({
    queries: [
      {
        queryKey: ["project", projectId] as const,
        queryFn: () => fetchProject({ data: { id: projectId } }),
      },
      {
        queryKey: ["project-stats", projectId] as const,
        queryFn: () => fetchStats({ data: { projectId } }),
      },
      { queryKey: ["llm-models"] as const, queryFn: () => fetchLLM() },
      { queryKey: ["prompts"] as const, queryFn: () => fetchPrompts() },
      { queryKey: ["app-config"] as const, queryFn: () => fetchConfig() },
    ],
  });

  const saveMut = useMutation({
    mutationFn: (input: ProjectFormValues) => saveProject({ data: input }),
    onSuccess: (saved) => {
      // Write the response straight into the project cache instead of
      // invalidating + refetching. The refetch race would otherwise clobber
      // any unsaved local edits the user made between submit and refetch
      // (auto-submit makes this race much more reachable).
      qc.setQueryData(["project", projectId], saved);
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err) =>
      toast.error({
        title: "保存失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const restoreProjectMut = useMutation({
    mutationFn: (id: number) => restoreProjectFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err) =>
      toast.error({
        title: "恢复失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const removeProjectMut = useMutation({
    mutationFn: (id: number) => removeProjectFn({ data: { id } }),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success({
        title: "项目已删除",
        duration: 8000,
        action: {
          label: "撤销",
          onClick: () => restoreProjectMut.mutate(id),
        },
      });
      // Bounce back to the project list — staying on the (now soft-deleted)
      // project's detail page would just hit the loader's notFound().
      navigate({ to: "/projects" });
    },
    onError: (err) =>
      toast.error({
        title: "删除失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const form = useAppForm({
    defaultValues: toProjectFormValues(projectId, project),
    validators: { onSubmit: updateProjectSchema },
    onSubmit: ({ value }) => saveMut.mutate(value),
  });

  useEffect(() => {
    if (project) form.reset(toProjectFormValues(projectId, project));
  }, [project, projectId, form]);

  const llmOptions: SelectOption<number | null>[] = llmList
    .filter((m) => m.enabled)
    .map((m) => ({
      value: m.id,
      label: `${m.llmServiceName} · ${m.name}`,
    }));
  const promptOptions: SelectOption<number | null>[] = promptList
    .filter((p) => p.enabled)
    .map((p) => ({ value: p.id, label: p.name }));

  const FALLBACK_PLACEHOLDER = "无";
  const defaultLlm = llmList.find((m) => m.id === appConfig?.defaultLlmModelId);
  const llmPlaceholder = defaultLlm
    ? `${defaultLlm.llmServiceName} / ${defaultLlm.name}`
    : FALLBACK_PLACEHOLDER;
  const promptPlaceholder =
    promptList.find((p) => p.id === appConfig?.defaultPromptId)?.name ?? FALLBACK_PLACEHOLDER;

  if (!project || !stats) {
    return <SettingsPanelSkeleton />;
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-6">
      {chapter && <ChapterSettingsSection chapter={chapter} />}

      <SectionCard
        title="项目设置"
        description="项目基本信息与默认配置，可在段落级别覆盖"
        actions={
          <Button
            variant="danger"
            size="sm"
            disabled={removeProjectMut.isPending}
            onClick={() => removeProjectMut.mutate(projectId)}
          >
            <TrashIcon />
            删除项目
          </Button>
        }
      >
        <form.AppForm>
          <form.AutoSubmit onSubmit={() => form.handleSubmit()} debounceMs={400}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <form.AppField name="name">
                {(field) => (
                  <field.FormField label="项目名称" className="md:col-span-2">
                    <field.InputField placeholder="例如：小王子" />
                  </field.FormField>
                )}
              </form.AppField>
              <form.AppField name="coverFileId">
                {(field) => (
                  <field.FormField label="封面图">
                    <CoverUploader
                      projectId={projectId}
                      name={project.name}
                      value={field.state.value ?? null}
                      onChange={(next) => field.handleChange(next)}
                    />
                  </field.FormField>
                )}
              </form.AppField>
              <form.AppField name="description">
                {(field) => (
                  <field.FormField label="描述">
                    <field.TextareaField
                      placeholder="可选，简要介绍这个项目"
                      className="h-37 min-h-37 w-full min-w-0 resize-none"
                    />
                  </field.FormField>
                )}
              </form.AppField>
              <form.AppField name="author">
                {(field) => (
                  <field.FormField label="作者">
                    <field.InputField placeholder="可选" />
                  </field.FormField>
                )}
              </form.AppField>
              <form.AppField name="locale">
                {(field) => (
                  <field.FormField label="语言">
                    <field.SelectField options={localeOptions} className="w-full" clearable />
                  </field.FormField>
                )}
              </form.AppField>

              <form.AppField name="llmModelId">
                {(field) => (
                  <field.FormField
                    label="默认 LLM 模型"
                    description="脚本智能切分等功能默认使用的 LLM"
                  >
                    <field.ComboboxField
                      options={llmOptions}
                      className="w-full"
                      clearable
                      placeholder={llmPlaceholder}
                    />
                  </field.FormField>
                )}
              </form.AppField>
              <form.AppField name="promptId">
                {(field) => (
                  <field.FormField label="默认提示词" description="智能格式化时默认使用的提示词">
                    <field.SelectField
                      options={promptOptions}
                      className="w-full"
                      clearable
                      placeholder={promptPlaceholder}
                    />
                  </field.FormField>
                )}
              </form.AppField>
              <form.AppField name="gap">
                {(field) => (
                  <field.FormField label="段落默认间隔" description="毫秒，留空使用全局默认">
                    <field.NumberField
                      min={0}
                      max={60_000}
                      step={50}
                      className="w-full"
                      integer
                      clearable
                      placeholder={appConfig ? String(appConfig.defaultSegmentGapMs) : undefined}
                    />
                  </field.FormField>
                )}
              </form.AppField>
              <form.AppField name="chapterGap">
                {(field) => (
                  <field.FormField label="章节间隔" description="毫秒，留空使用全局默认">
                    <field.NumberField
                      min={0}
                      max={600_000}
                      step={100}
                      className="w-full"
                      integer
                      clearable
                      placeholder={appConfig ? String(appConfig.defaultChapterGapMs) : undefined}
                    />
                  </field.FormField>
                )}
              </form.AppField>
            </div>
          </form.AutoSubmit>
        </form.AppForm>
      </SectionCard>

      <ChapterRecycleBinSection projectId={projectId} />

      <MaintenanceSection
        projectId={projectId}
        stats={stats}
        onChanged={() => {
          qc.invalidateQueries({ queryKey: ["project-stats", projectId] });
          qc.invalidateQueries({ queryKey: ["narrators", projectId] });
          qc.invalidateQueries({ queryKey: ["segments"] });
          qc.invalidateQueries({ queryKey: ["export-history", projectId] });
        }}
      />
    </div>
  );
}

function toProjectFormValues(
  projectId: number,
  project: Awaited<ReturnType<typeof getProject>> | undefined,
): ProjectFormValues {
  if (!project) {
    return {
      id: projectId,
      name: "",
      description: null,
      author: null,
      coverFileId: null,
      locale: DEFAULT_LOCALE,
      voiceId: null,
      llmModelId: null,
      promptId: null,
      gap: null,
      chapterGap: null,
    };
  }
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    author: project.author,
    coverFileId: project.coverFileId,
    locale: project.settings?.locale ?? null,
    voiceId: project.voiceId,
    llmModelId: project.llmModelId,
    promptId: project.promptId,
    gap: project.settings?.gap ?? null,
    chapterGap: project.settings?.chapterGap ?? null,
  };
}

function toChapterFormValues(chapter: ChapterListItem): ChapterFormValues {
  return {
    id: chapter.id,
    name: chapter.name,
    description: chapter.description ?? "",
  };
}

function ChapterSettingsSection({ chapter }: { chapter: ChapterListItem }) {
  const qc = useQueryClient();
  const projectId = chapter.projectId;
  const saveChapter = useServerFn(updateChapter);
  const removeChapterFn = useServerFn(deleteChapter);
  const restoreChapterFn = useServerFn(restoreChapter);

  const saveMut = useMutation({
    mutationFn: (input: ChapterFormValues) => saveChapter({ data: input }),
    onSuccess: (_, input) => {
      // Patch the cached chapters list directly. Invalidate-then-refetch would
      // race auto-submit and clobber unsaved keystrokes; mirror the project
      // settings pattern above.
      qc.setQueryData<ChapterListItem[]>(["chapters", projectId], (prev) =>
        prev?.map((c) =>
          c.id === input.id
            ? {
                ...c,
                name: input.name,
                description: input.description ? input.description : null,
              }
            : c,
        ),
      );
    },
    onError: (err) =>
      toast.error({
        title: "保存失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const restoreMut = useMutation({
    mutationFn: (id: number) => restoreChapterFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chapters", projectId] });
      qc.invalidateQueries({ queryKey: ["deleted-chapters", projectId] });
    },
    onError: (err) =>
      toast.error({
        title: "恢复失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  // Mirrors the chapter-list dropdown delete: soft-delete + 8s undo toast.
  // The route loader auto-redirects to the next chapter when the selected
  // one disappears, so no manual navigation is needed here.
  const removeMut = useMutation({
    mutationFn: (id: number) => removeChapterFn({ data: { id } }),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["chapters", projectId] });
      qc.invalidateQueries({ queryKey: ["deleted-chapters", projectId] });
      toast.success({
        title: "章节已删除",
        duration: 8000,
        action: {
          label: "撤销",
          onClick: () => restoreMut.mutate(id),
        },
      });
    },
    onError: (err) =>
      toast.error({
        title: "删除失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const form = useAppForm({
    defaultValues: toChapterFormValues(chapter),
    validators: { onSubmit: updateChapterSchema },
    onSubmit: ({ value }) => saveMut.mutate(value),
  });

  useEffect(() => {
    form.reset(toChapterFormValues(chapter));
  }, [chapter, form]);

  return (
    <SectionCard
      title="章节设置"
      description="当前选中章节的基本信息"
      actions={
        <Button
          variant="danger"
          size="sm"
          disabled={removeMut.isPending}
          onClick={() => removeMut.mutate(chapter.id)}
        >
          <TrashIcon />
          删除章节
        </Button>
      }
    >
      <form.AppForm>
        <form.AutoSubmit onSubmit={() => form.handleSubmit()} debounceMs={400}>
          <div className="flex flex-col gap-4">
            <form.AppField name="name">
              {(field) => (
                <field.FormField label="章节名称">
                  <field.InputField placeholder="例如：第一章" />
                </field.FormField>
              )}
            </form.AppField>
            <form.AppField name="description">
              {(field) => (
                <field.FormField label="描述">
                  <field.TextareaField
                    placeholder="可选，简要介绍这一章节"
                    rows={4}
                    className="w-full"
                  />
                </field.FormField>
              )}
            </form.AppField>
          </div>
        </form.AutoSubmit>
      </form.AppForm>
    </SectionCard>
  );
}

function SettingsPanelSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-6">
      <SectionCard title="章节设置" description="当前选中章节的基本信息">
        <div className="flex flex-col gap-4">
          <FormFieldSkeleton />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="项目设置" description="项目基本信息与默认配置，可在段落级别覆盖">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormFieldSkeleton className="md:col-span-2" />
          <CoverFieldSkeleton />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-37 w-full" />
          </div>
          <FormFieldSkeleton />
          <FormFieldSkeleton />
          <FormFieldSkeleton />
          <FormFieldSkeleton />
          <FormFieldSkeleton />
          <FormFieldSkeleton />
          <FormFieldSkeleton />
        </div>
      </SectionCard>

      <SectionCard
        title="项目维护"
        description="清理项目中未使用的资源以释放存储空间。所有操作不可撤销，请谨慎操作。"
      >
        <ul className="flex flex-col">
          {Array.from({ length: 5 }, (_, i) => (
            <li
              key={i}
              className={cn(
                "flex items-center justify-between gap-3 py-3",
                i > 0 && "border-t border-content-400/10",
              )}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-72 max-w-full" />
              </div>
              <Skeleton className="h-6 w-16" />
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

function FormFieldSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-8 w-full" />
    </div>
  );
}

function CoverFieldSkeleton() {
  return (
    <div className="flex flex-col items-start gap-1.5">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="aspect-3/4 w-28 rounded-sm" />
      <Skeleton className="h-3 w-40" />
    </div>
  );
}

type ChapterRecycleConfirm =
  | { type: "restore"; chapter: DeletedChapterListItem }
  | { type: "purge"; chapter: DeletedChapterListItem };

function ChapterRecycleBinSection({ projectId }: { projectId: number }) {
  const qc = useQueryClient();
  const fetchList = useServerFn(listDeletedChapters);
  const restoreFn = useServerFn(restoreChapter);
  const purgeFn = useServerFn(purgeChapter);

  const [confirm, setConfirm] = useState<ChapterRecycleConfirm | null>(null);

  const { data: items = [] } = useQuery({
    queryKey: ["deleted-chapters", projectId],
    queryFn: () => fetchList({ data: { projectId } }),
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["deleted-chapters", projectId] });
    qc.invalidateQueries({ queryKey: ["chapters", projectId] });
    qc.invalidateQueries({ queryKey: ["project-stats", projectId] });
  }

  const restoreMut = useMutation({
    mutationFn: (id: number) => restoreFn({ data: { id } }),
    onSuccess: () => {
      invalidate();
      setConfirm(null);
    },
    onError: (err) =>
      toast.error({
        title: "恢复失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const purgeMut = useMutation({
    mutationFn: (id: number) => purgeFn({ data: { id } }),
    onSuccess: (r) => {
      invalidate();
      setConfirm(null);
      toast.success(
        r.deletedFiles > 0
          ? `已永久删除章节，并清理 ${r.deletedFiles} 个语音合成文件`
          : "已永久删除章节",
      );
    },
    onError: (err) =>
      toast.error({
        title: "删除失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  // Hide the section entirely when there's nothing in the recycle bin —
  // empty state isn't worth the visual real estate inside a project.
  if (items.length === 0) return null;

  const isPending = restoreMut.isPending || purgeMut.isPending;

  return (
    <SectionCard
      title="回收站"
      description="此处列出本项目已删除的章节，可恢复或永久删除。永久删除会一并清理章节内段落的语音合成及对应音频文件。"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名称</TableHead>
            <TableHead>段落</TableHead>
            <TableHead>语音合成</TableHead>
            <TableHead>删除时间</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="text-content-100">{c.name}</TableCell>
              <TableCell className="text-content-300">
                {c.segmentCount > 0 ? `${c.segmentCount} 个` : "—"}
              </TableCell>
              <TableCell className="text-content-300">
                {c.generationCount > 0
                  ? `${c.generationCount} 条 · ${formatBytes(c.fileSize)}`
                  : "—"}
              </TableCell>
              <TableCell className="text-content-300">{relativeTime(c.deletedAt)}</TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => setConfirm({ type: "restore", chapter: c })}
                  >
                    <RotateCcwIcon />
                    恢复
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={isPending}
                    onClick={() => setConfirm({ type: "purge", chapter: c })}
                  >
                    <TrashIcon />
                    永久删除
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog
        open={confirm?.type === "restore"}
        onOpenChange={(open) => {
          if (!open && !restoreMut.isPending) setConfirm(null);
        }}
        title="确认恢复章节"
        description={
          confirm?.type === "restore"
            ? `章节 “${confirm.chapter.name}” 将被恢复并重新出现在章节列表中。`
            : undefined
        }
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setConfirm(null)}
              disabled={restoreMut.isPending}
            >
              取消
            </Button>
            <Button
              disabled={restoreMut.isPending}
              onClick={() => {
                if (confirm?.type !== "restore") return;
                restoreMut.mutate(confirm.chapter.id);
              }}
            >
              {restoreMut.isPending ? "恢复中…" : "确认恢复"}
            </Button>
          </>
        }
      />

      <Dialog
        open={confirm?.type === "purge"}
        onOpenChange={(open) => {
          if (!open && !purgeMut.isPending) setConfirm(null);
        }}
        title="确认永久删除章节"
        description={
          confirm?.type === "purge"
            ? `章节 “${confirm.chapter.name}” 及其全部段落${
                confirm.chapter.generationCount > 0
                  ? `、${confirm.chapter.generationCount} 条语音合成（共 ${formatBytes(confirm.chapter.fileSize)}）以及对应的音频文件`
                  : ""
              }将从存储中彻底移除，操作不可撤销。`
            : undefined
        }
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={purgeMut.isPending}>
              取消
            </Button>
            <Button
              variant="danger"
              disabled={purgeMut.isPending}
              onClick={() => {
                if (confirm?.type !== "purge") return;
                purgeMut.mutate(confirm.chapter.id);
              }}
            >
              {purgeMut.isPending ? "删除中…" : "确认永久删除"}
            </Button>
          </>
        }
      />
    </SectionCard>
  );
}

function MaintenanceSection({
  projectId,
  stats,
  onChanged,
}: {
  projectId: number;
  stats: ProjectStats;
  onChanged: () => void;
}) {
  type ActionKey =
    | "narrators"
    | "candidate-generations"
    | "orphan-generations"
    | "outdated-exports";

  const [confirming, setConfirming] = useState<ActionKey | null>(null);

  const cleanNarrators = useServerFn(deleteUnusedNarrators);
  const clearCandidates = useServerFn(clearCandidateGenerations);
  const cleanOrphans = useServerFn(deleteOrphanGenerations);
  const cleanOutdatedExports = useServerFn(deleteOutdatedExportHistory);

  function onError(err: unknown) {
    toast.error({
      title: "操作失败",
      description: err instanceof Error ? err.message : String(err),
    });
  }
  function afterDone(message: string) {
    toast.success(message);
    onChanged();
    setConfirming(null);
  }

  const narratorsMut = useMutation({
    mutationFn: () => cleanNarrators({ data: { projectId } }),
    onSuccess: (r) =>
      afterDone(r.deleted > 0 ? `已删除 ${r.deleted} 个未使用的角色` : "没有可删除的角色"),
    onError,
  });
  const candidateMut = useMutation({
    mutationFn: () => clearCandidates({ data: { projectId } }),
    onSuccess: (r) =>
      afterDone(r.cleared > 0 ? `已清理 ${r.cleared} 条候选语音合成` : "没有可清理的候选语音合成"),
    onError,
  });
  const orphanMut = useMutation({
    mutationFn: () => cleanOrphans({ data: { projectId } }),
    onSuccess: (r) =>
      afterDone(r.deleted > 0 ? `已删除 ${r.deleted} 条无主语音合成` : "没有可删除的无主语音合成"),
    onError,
  });
  const outdatedExportsMut = useMutation({
    mutationFn: () => cleanOutdatedExports({ data: { projectId } }),
    onSuccess: (r) =>
      afterDone(r.deleted > 0 ? `已删除 ${r.deleted} 个过时的导出历史` : "没有可删除的导出历史"),
    onError,
  });

  const actions: ReadonlyArray<{
    key: ActionKey;
    title: string;
    label: string;
    description: string;
    confirmTitle: string;
    confirmDescription: string;
    confirmLabel: string;
    pendingLabel: string;
    disabled: boolean;
    isPending: boolean;
    run: () => void;
  }> = [
    {
      key: "narrators",
      title: "删除未使用的角色",
      label: "删除",
      description: "删除当前没有任何段落引用的角色",
      confirmTitle: "确认删除未使用的角色",
      confirmDescription: `将永久删除 ${stats.narrators.unused} 个未被任何段落引用的角色，操作不可撤销。`,
      confirmLabel: "确认删除",
      pendingLabel: "删除中…",
      disabled: stats.narrators.unused === 0,
      isPending: narratorsMut.isPending,
      run: () => narratorsMut.mutate(),
    },
    {
      key: "candidate-generations",
      title: "清理候选语音合成",
      label: "清理",
      description: "断开候选语音合成与对应段落的关联，使其变为无主语音合成",
      confirmTitle: "确认清理候选语音合成",
      confirmDescription: `将断开 ${stats.ttsGenerations.candidate.count} 条候选语音合成与段落的关联，它们会变成无主语音合成（共 ${formatBytes(stats.ttsGenerations.candidate.size)}），可在下面继续删除。`,
      confirmLabel: "确认清理",
      pendingLabel: "清理中…",
      disabled: stats.ttsGenerations.candidate.count === 0,
      isPending: candidateMut.isPending,
      run: () => candidateMut.mutate(),
    },
    {
      key: "orphan-generations",
      title: "删除无主语音合成",
      label: "删除",
      description: "删除已与段落断开的语音合成及其音频文件",
      confirmTitle: "确认删除无主语音合成",
      confirmDescription: `将永久删除 ${stats.ttsGenerations.orphan.count} 条无主语音合成（共 ${formatBytes(stats.ttsGenerations.orphan.size)}）以及对应的音频文件，操作不可撤销。`,
      confirmLabel: "确认删除",
      pendingLabel: "删除中…",
      disabled: stats.ttsGenerations.orphan.count === 0,
      isPending: orphanMut.isPending,
      run: () => orphanMut.mutate(),
    },
    {
      key: "outdated-exports",
      title: "删除过时的导出历史",
      label: "删除",
      description: "保留最新的一条导出历史，删除其余历史及其音频文件",
      confirmTitle: "确认删除过时的导出历史",
      confirmDescription: `将永久删除 ${stats.exports.outdated.count} 个过时的导出历史（共 ${formatBytes(stats.exports.outdated.size)}）以及对应的音频文件，仅保留最新的一条，操作不可撤销。`,
      confirmLabel: "确认删除",
      pendingLabel: "删除中…",
      disabled: stats.exports.outdated.count === 0,
      isPending: outdatedExportsMut.isPending,
      run: () => outdatedExportsMut.mutate(),
    },
  ];

  const active = actions.find((a) => a.key === confirming) ?? null;

  return (
    <SectionCard
      title="项目维护"
      description="清理项目中未使用的资源以释放存储空间。所有操作不可撤销，请谨慎操作。"
    >
      <ul className="flex flex-col">
        {actions.map((action, i) => (
          <li
            key={action.key}
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 py-3",
              i > 0 && "border-t border-content-400/10",
            )}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm text-content-100">{action.title}</span>
              <span className="text-xs text-content-300">{action.description}</span>
            </div>
            <Button
              variant="danger"
              size="sm"
              disabled={action.disabled || action.isPending}
              onClick={() => setConfirming(action.key)}
            >
              <Trash2Icon />
              {action.label}
            </Button>
          </li>
        ))}
      </ul>

      <Dialog
        open={!!active}
        onOpenChange={(open) => {
          if (!open && !active?.isPending) setConfirming(null);
        }}
        title={active?.confirmTitle}
        description={active?.confirmDescription}
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setConfirming(null)}
              disabled={active?.isPending}
            >
              取消
            </Button>
            <Button variant="danger" disabled={active?.isPending} onClick={() => active?.run()}>
              {active?.isPending ? active.pendingLabel : active?.confirmLabel}
            </Button>
          </>
        }
      />
    </SectionCard>
  );
}

function CoverUploader({
  projectId,
  name,
  value,
  onChange,
}: {
  projectId: number;
  name: string;
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const createUpload = useServerFn(uploadProjectCover);
  const autoSubmit = useAutoSubmit();

  function commit(next: number | null) {
    onChange(next);
    autoSubmit?.();
  }

  async function handleUpload(file: File) {
    if (!file.type.toLowerCase().startsWith("image/")) {
      toast.error({ title: "仅支持图片文件" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error({ title: "图片过大（最大 10MB）" });
      return;
    }
    setUploading(true);
    try {
      const data = new FormData();
      data.set("file", file);
      data.set("projectId", String(projectId));
      const result = await createUpload({ data });
      commit(result.coverFileId);
    } catch (err) {
      toast.error({
        title: "上传失败",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setUploading(false);
    }
  }

  function openPicker() {
    if (uploading) return;
    fileInputRef.current?.click();
  }

  const hasCover = value != null;

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div
        role="button"
        tabIndex={uploading ? -1 : 0}
        aria-label={hasCover ? "更换封面" : "上传封面"}
        aria-disabled={uploading}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        className={cn(
          "group relative aspect-3/4 w-28 shrink-0 overflow-hidden rounded-sm border border-content-400/20 bg-base-300 shadow-sm transition-colors",
          uploading ? "cursor-wait" : "cursor-pointer hover:border-content-400/50",
        )}
      >
        {hasCover ? (
          <ProjectCover name={name} projectId={projectId} coverFileId={value} />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1 text-content-400">
            <ImageIcon className="size-6" />
            <span className="text-xs">点击上传</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-base-100/60">
            <Loader2Icon className="size-5 animate-spin text-content-200" />
          </div>
        )}
        {hasCover && !uploading && (
          <button
            type="button"
            aria-label="移除封面"
            className="absolute right-1 bottom-1 inline-flex size-6 items-center justify-center rounded-md bg-error/90 text-error-content opacity-0 shadow-sm transition-opacity group-hover:opacity-100 not-disabled:hover:bg-error focus-visible:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              commit(null);
            }}
          >
            <Trash2Icon className="size-3.5" />
          </button>
        )}
      </div>
      <span className="text-xs text-content-400">支持 PNG / JPG / WebP，最大 10MB</span>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = "";
        }}
      />
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
