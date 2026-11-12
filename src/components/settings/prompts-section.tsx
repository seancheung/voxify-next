import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DownloadIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import PromptDialog from "@/components/settings/prompt-dialog";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import Dropdown from "@/components/ui/dropdown";
import Skeleton from "@/components/ui/skeleton";
import Switch from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { t } from "@/i18n";
import {
  deletePrompt,
  importDefaultPrompts,
  listPrompts,
  type PromptListItem,
  togglePrompt,
} from "@/lib/prompts.functions";
import { cn } from "@/utils/cn";

export default function PromptsSection() {
  const fetchList = useServerFn(listPrompts);
  const toggleFn = useServerFn(togglePrompt);
  const deleteFn = useServerFn(deletePrompt);
  const importDefaultsFn = useServerFn(importDefaultPrompts);
  const qc = useQueryClient();

  const [editing, setEditing] = useState<PromptListItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<PromptListItem | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["prompts"],
    queryFn: () => fetchList(),
  });
  const showSkeleton = useDelayedFlag(isLoading);

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      toggleFn({ data: { id, enabled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prompts"] }),
    onError: (err) =>
      toast.error({
        title: t("Update failed"),
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prompts"] });
      setConfirmingDelete(null);
      toast.success(t("Prompt deleted"));
    },
    onError: (err) =>
      toast.error({
        title: t("Deletion failed"),
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const importDefaultsMut = useMutation({
    mutationFn: () => importDefaultsFn(),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["prompts"] });
      toast.success(t("Imported {0} default prompts", result.inserted));
    },
    onError: (err) =>
      toast.error({
        title: t("Import failed"),
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  return (
    <section className="rounded-lg border border-content-400/20 bg-base-200 p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl text-content-100">{t("Prompt")}</h2>
          <p className="mt-1 text-sm text-content-300">
            {t("Reusable LLM prompt templates that can be selected per project")}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon />
          {t("Add prompt")}
        </Button>
      </header>

      {showSkeleton ? (
        <ul className="flex flex-col gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <PromptSkeleton key={i} />
          ))}
        </ul>
      ) : isLoading ? null : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-content-400/15 py-12 text-content-400">
          <p className="text-sm">{t("Add a prompt to get started")}</p>
          <p className="text-xs text-content-400/80">
            {t(
              "Or import four built-in English and Chinese prompts for segmentation and character recognition",
            )}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => importDefaultsMut.mutate()}
            disabled={importDefaultsMut.isPending}
          >
            <DownloadIcon />
            {importDefaultsMut.isPending ? t("Importing…") : t("Import default prompts")}
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((p) => (
            <li
              key={p.id}
              className={cn(
                "flex items-start gap-3 rounded-md border border-content-400/15 bg-base-300 px-4 py-3",
                !p.enabled && "opacity-60",
              )}
            >
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base text-content-100">{p.name}</h3>
                {p.description && (
                  <p className="mt-0.5 truncate text-xs text-content-300" title={p.description}>
                    {p.description}
                  </p>
                )}
                <p className="mt-1 line-clamp-2 text-xs whitespace-pre-wrap text-content-300">
                  {p.content}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Switch
                  value={p.enabled ?? false}
                  onChange={(enabled) => toggleMut.mutate({ id: p.id, enabled })}
                  size="sm"
                  aria-label={p.enabled ? t("Disable") : t("Enable")}
                />
                <Dropdown
                  align="end"
                  items={[
                    {
                      key: "edit",
                      label: t("Edit"),
                      icon: <PencilIcon />,
                      onSelect: () => setEditing(p),
                    },
                    { type: "separator" },
                    {
                      key: "delete",
                      label: t("Delete"),
                      icon: <TrashIcon />,
                      danger: true,
                      onSelect: () => setConfirmingDelete(p),
                    },
                  ]}
                >
                  <Button variant="ghost" size="sm" shape="circle" aria-label={t("More actions")}>
                    <MoreHorizontalIcon />
                  </Button>
                </Dropdown>
              </div>
            </li>
          ))}
        </ul>
      )}

      <PromptDialog
        open={creating || !!editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        prompt={editing}
      />

      <Dialog
        open={!!confirmingDelete}
        onOpenChange={(open) => {
          if (!open && !deleteMut.isPending) setConfirmingDelete(null);
        }}
        title={t("Delete prompt?")}
        description={
          confirmingDelete
            ? t("“{0}” will be permanently deleted.", confirmingDelete.name)
            : undefined
        }
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setConfirmingDelete(null)}
              disabled={deleteMut.isPending}
            >
              {t("Cancel")}
            </Button>
            <Button
              variant="danger"
              disabled={deleteMut.isPending}
              onClick={() => {
                if (confirmingDelete) deleteMut.mutate(confirmingDelete.id);
              }}
            >
              {deleteMut.isPending ? t("Deleting…") : t("Confirm deletion")}
            </Button>
          </>
        }
      />
    </section>
  );
}

function PromptSkeleton() {
  return (
    <li className="flex items-start gap-3 rounded-md border border-content-400/15 bg-base-300 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-3/5" />
        <div className="space-y-1.5 pt-0.5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      </div>
      <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
      <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
    </li>
  );
}
