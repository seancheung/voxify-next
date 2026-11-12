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
import { t } from "@/i18n";
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
        title: t("Save failed"),
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
        title: t("Restore failed"),
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const removeProjectMut = useMutation({
    mutationFn: (id: number) => removeProjectFn({ data: { id } }),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success({
        title: t("Project deleted"),
        duration: 8000,
        action: {
          label: t("Undo"),
          onClick: () => restoreProjectMut.mutate(id),
        },
      });
      // Bounce back to the project list — staying on the (now soft-deleted)
      // project's detail page would just hit the loader's notFound().
      navigate({ to: "/projects" });
    },
    onError: (err) =>
      toast.error({
        title: t("Deletion failed"),
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

  const FALLBACK_PLACEHOLDER = t("None");
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
        title={t("Project settings")}
        description={t("Project details and defaults. Individual segments can override defaults.")}
        actions={
          <Button
            variant="danger"
            size="sm"
            disabled={removeProjectMut.isPending}
            onClick={() => removeProjectMut.mutate(projectId)}
          >
            <TrashIcon />
            {t("Delete project")}
          </Button>
        }
      >
        <form.AppForm>
          <form.AutoSubmit onSubmit={() => form.handleSubmit()} debounceMs={400}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <form.AppField name="name">
                {(field) => (
                  <field.FormField label={t("Project name")} className="md:col-span-2">
                    <field.InputField placeholder={t("Example: The Little Prince")} />
                  </field.FormField>
                )}
              </form.AppField>
              <form.AppField name="coverFileId">
                {(field) => (
                  <field.FormField label={t("Cover image")}>
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
                  <field.FormField label={t("Description")}>
                    <field.TextareaField
                      placeholder={t("Optional project summary")}
                      className="h-37 min-h-37 w-full min-w-0 resize-none"
                    />
                  </field.FormField>
                )}
              </form.AppField>
              <form.AppField name="author">
                {(field) => (
                  <field.FormField label={t("Author")}>
                    <field.InputField placeholder={t("Optional")} />
                  </field.FormField>
                )}
              </form.AppField>
              <form.AppField name="locale">
                {(field) => (
                  <field.FormField label={t("Language")}>
                    <field.SelectField options={localeOptions} className="w-full" clearable />
                  </field.FormField>
                )}
              </form.AppField>

              <form.AppField name="llmModelId">
                {(field) => (
                  <field.FormField
                    label={t("Default LLM model")}
                    description={t("LLM used for smart script formatting")}
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
                  <field.FormField
                    label={t("Default prompt")}
                    description={t("Prompt used for smart formatting")}
                  >
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
                  <field.FormField
                    label={t("Default segment gap")}
                    description={t("Milliseconds. Leave blank to use the global default.")}
                  >
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
                  <field.FormField
                    label={t("Chapter gap")}
                    description={t("Milliseconds. Leave blank to use the global default.")}
                  >
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
        title: t("Save failed"),
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
        title: t("Restore failed"),
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
        title: t("Chapter deleted"),
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
      title={t("Chapter settings")}
      description={t("Details for the selected chapter")}
      actions={
        <Button
          variant="danger"
          size="sm"
          disabled={removeMut.isPending}
          onClick={() => removeMut.mutate(chapter.id)}
        >
          <TrashIcon />
          {t("Delete chapter")}
        </Button>
      }
    >
      <form.AppForm>
        <form.AutoSubmit onSubmit={() => form.handleSubmit()} debounceMs={400}>
          <div className="flex flex-col gap-4">
            <form.AppField name="name">
              {(field) => (
                <field.FormField label={t("Chapter name")}>
                  <field.InputField placeholder={t("Example: Chapter One")} />
                </field.FormField>
              )}
            </form.AppField>
            <form.AppField name="description">
              {(field) => (
                <field.FormField label={t("Description")}>
                  <field.TextareaField
                    placeholder={t("Optional chapter summary")}
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
      <SectionCard
        title={t("Chapter settings")}
        description={t("Details for the selected chapter")}
      >
        <div className="flex flex-col gap-4">
          <FormFieldSkeleton />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title={t("Project settings")}
        description={t("Project details and defaults. Individual segments can override defaults.")}
      >
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
        title={t("Project maintenance")}
        description={t("Free storage by removing unused resources. These actions are permanent.")}
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
        title: t("Restore failed"),
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
          ? t("Permanently deleted the chapter and {0} synthesized audio files", r.deletedFiles)
          : t("Chapter permanently deleted"),
      );
    },
    onError: (err) =>
      toast.error({
        title: t("Deletion failed"),
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  // Hide the section entirely when there's nothing in the recycle bin —
  // empty state isn't worth the visual real estate inside a project.
  if (items.length === 0) return null;

  const isPending = restoreMut.isPending || purgeMut.isPending;

  return (
    <SectionCard
      title={t("Recycle bin")}
      description={t(
        "Restore or permanently delete chapters. Permanent deletion also removes their generated audio and files.",
      )}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("Name")}</TableHead>
            <TableHead>{t("Segments")}</TableHead>
            <TableHead>{t("Speech synthesis")}</TableHead>
            <TableHead>{t("Deleted at")}</TableHead>
            <TableHead className="text-right">{t("Actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="text-content-100">{c.name}</TableCell>
              <TableCell className="text-content-300">
                {c.segmentCount > 0 ? t("{0} items", c.segmentCount) : "—"}
              </TableCell>
              <TableCell className="text-content-300">
                {c.generationCount > 0
                  ? t("{0} entries · {1}", c.generationCount, formatBytes(c.fileSize))
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
                    {t("Restore")}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={isPending}
                    onClick={() => setConfirm({ type: "purge", chapter: c })}
                  >
                    <TrashIcon />
                    {t("Delete permanently")}
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
        title={t("Restore chapter?")}
        description={
          confirm?.type === "restore"
            ? t("“{0}” will return to the chapter list.", confirm.chapter.name)
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
              {t("Cancel")}
            </Button>
            <Button
              disabled={restoreMut.isPending}
              onClick={() => {
                if (confirm?.type !== "restore") return;
                restoreMut.mutate(confirm.chapter.id);
              }}
            >
              {restoreMut.isPending ? t("Restoring…") : t("Confirm restore")}
            </Button>
          </>
        }
      />

      <Dialog
        open={confirm?.type === "purge"}
        onOpenChange={(open) => {
          if (!open && !purgeMut.isPending) setConfirm(null);
        }}
        title={t("Permanently delete chapter?")}
        description={
          confirm?.type === "purge"
            ? t(
                "“{0}” and all its segments{1} will be permanently removed from storage.",
                confirm.chapter.name,
                confirm.chapter.generationCount > 0
                  ? t(
                      ", {0} generations ({1}) and their audio files",
                      confirm.chapter.generationCount,
                      formatBytes(confirm.chapter.fileSize),
                    )
                  : "",
              )
            : undefined
        }
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={purgeMut.isPending}>
              {t("Cancel")}
            </Button>
            <Button
              variant="danger"
              disabled={purgeMut.isPending}
              onClick={() => {
                if (confirm?.type !== "purge") return;
                purgeMut.mutate(confirm.chapter.id);
              }}
            >
              {purgeMut.isPending ? t("Deleting…") : t("Confirm permanent deletion")}
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
      title: t("Operation failed"),
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
      afterDone(
        r.deleted > 0
          ? t("Deleted {0} unused characters", r.deleted)
          : t("No unused characters to delete"),
      ),
    onError,
  });
  const candidateMut = useMutation({
    mutationFn: () => clearCandidates({ data: { projectId } }),
    onSuccess: (r) =>
      afterDone(
        r.cleared > 0
          ? t("Cleared {0} alternate generations", r.cleared)
          : t("No alternate generations to clear"),
      ),
    onError,
  });
  const orphanMut = useMutation({
    mutationFn: () => cleanOrphans({ data: { projectId } }),
    onSuccess: (r) =>
      afterDone(
        r.deleted > 0
          ? t("Deleted {0} orphaned generations", r.deleted)
          : t("No orphaned generations to delete"),
      ),
    onError,
  });
  const outdatedExportsMut = useMutation({
    mutationFn: () => cleanOutdatedExports({ data: { projectId } }),
    onSuccess: (r) =>
      afterDone(
        r.deleted > 0
          ? t("Deleted {0} outdated exports", r.deleted)
          : t("No outdated exports to delete"),
      ),
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
      title: t("Delete unused characters"),
      label: t("Delete"),
      description: t("Delete characters that no segment uses"),
      confirmTitle: t("Delete unused characters?"),
      confirmDescription: t(
        "Permanently delete {0} characters that no segment uses?",
        stats.narrators.unused,
      ),
      confirmLabel: t("Confirm deletion"),
      pendingLabel: t("Deleting…"),
      disabled: stats.narrators.unused === 0,
      isPending: narratorsMut.isPending,
      run: () => narratorsMut.mutate(),
    },
    {
      key: "candidate-generations",
      title: t("Clear alternate generations"),
      label: t("Clear generations"),
      description: t("Detach alternate generations from their segments, making them orphaned."),
      confirmTitle: t("Clear alternate generations?"),
      confirmDescription: t(
        "Detach {0} alternate generations ({1}) from their segments? You can delete the orphaned generations below.",
        stats.ttsGenerations.candidate.count,
        formatBytes(stats.ttsGenerations.candidate.size),
      ),
      confirmLabel: t("Confirm cleanup"),
      pendingLabel: t("Cleaning up…"),
      disabled: stats.ttsGenerations.candidate.count === 0,
      isPending: candidateMut.isPending,
      run: () => candidateMut.mutate(),
    },
    {
      key: "orphan-generations",
      title: t("Delete orphaned generations"),
      label: t("Delete"),
      description: t("Delete detached generations and their audio files"),
      confirmTitle: t("Delete orphaned generations?"),
      confirmDescription: t(
        "Permanently delete {0} orphaned generations ({1}) and their audio files?",
        stats.ttsGenerations.orphan.count,
        formatBytes(stats.ttsGenerations.orphan.size),
      ),
      confirmLabel: t("Confirm deletion"),
      pendingLabel: t("Deleting…"),
      disabled: stats.ttsGenerations.orphan.count === 0,
      isPending: orphanMut.isPending,
      run: () => orphanMut.mutate(),
    },
    {
      key: "outdated-exports",
      title: t("Delete outdated exports"),
      label: t("Delete"),
      description: t("Keep the latest export and delete older exports and their files"),
      confirmTitle: t("Delete outdated exports?"),
      confirmDescription: t(
        "Permanently delete {0} older exports ({1}) and their audio files? The latest export will be kept.",
        stats.exports.outdated.count,
        formatBytes(stats.exports.outdated.size),
      ),
      confirmLabel: t("Confirm deletion"),
      pendingLabel: t("Deleting…"),
      disabled: stats.exports.outdated.count === 0,
      isPending: outdatedExportsMut.isPending,
      run: () => outdatedExportsMut.mutate(),
    },
  ];

  const active = actions.find((a) => a.key === confirming) ?? null;

  return (
    <SectionCard
      title={t("Project maintenance")}
      description={t("Free storage by removing unused resources. These actions are permanent.")}
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
              {t("Cancel")}
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
      toast.error({ title: t("Choose an image file") });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error({ title: t("Image exceeds 10 MB") });
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
        title: t("Upload failed"),
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
        aria-label={hasCover ? t("Change cover") : t("Upload cover")}
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
            <span className="text-xs">{t("Click to upload")}</span>
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
            aria-label={t("Remove cover")}
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
      <span className="text-xs text-content-400">{t("PNG, JPG or WebP, up to 10 MB")}</span>
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
