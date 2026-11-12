import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontalIcon, PencilIcon, PlusIcon, RefreshCcwIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import LLMServiceDialog from "@/components/settings/llm-service-dialog";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import Dropdown from "@/components/ui/dropdown";
import Skeleton from "@/components/ui/skeleton";
import Switch from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { t } from "@/i18n";
import { syncLLMModels } from "@/lib/llm-models.functions";
import {
  deleteLLMService,
  type LLMServiceListItem,
  listLLMServices,
  supportsModelSync,
  toggleLLMService,
} from "@/lib/llm-services.functions";
import { LLMType } from "@/types/llm";
import { cn } from "@/utils/cn";
import Badge from "../ui/badge";

const TYPE_LABELS: Record<LLMType, string> = {
  [LLMType.OpenAI]: "OpenAI",
  [LLMType.Anthropic]: "Anthropic",
  [LLMType.GoogleGenerativeAI]: "Google Gen AI",
  [LLMType.Ollama]: "Ollama",
  [LLMType.DeepSeek]: "DeepSeek",
};

export default function LLMServicesSection() {
  const fetchList = useServerFn(listLLMServices);
  const toggleFn = useServerFn(toggleLLMService);
  const deleteFn = useServerFn(deleteLLMService);
  const syncFn = useServerFn(syncLLMModels);
  const qc = useQueryClient();

  const [editing, setEditing] = useState<LLMServiceListItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<LLMServiceListItem | null>(null);
  const [syncingId, setSyncingId] = useState<number | null>(null);

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["llm-services"],
    queryFn: () => fetchList(),
  });
  const showSkeleton = useDelayedFlag(isLoading);

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      toggleFn({ data: { id, enabled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["llm-services"] }),
    onError: (err) =>
      toast.error({
        title: t("Update failed"),
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["llm-services"] });
      qc.invalidateQueries({ queryKey: ["llm-models"] });
      setConfirmingDelete(null);
      toast.success(t("LLM service deleted"));
    },
    onError: (err) =>
      toast.error({
        title: t("Deletion failed"),
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const syncMut = useMutation({
    mutationFn: (id: number) => syncFn({ data: { id } }),
    onMutate: (id: number) => setSyncingId(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["llm-models"] });
      toast.success({
        title: t("Models synced"),
        description: t(
          "{0} total, {1} added, {2} updated, {3} removed",
          res.total,
          res.added,
          res.updated,
          res.removed,
        ),
      });
    },
    onError: (err) =>
      toast.error({
        title: t("Sync failed"),
        description: err instanceof Error ? err.message : String(err),
      }),
    onSettled: () => setSyncingId(null),
  });

  return (
    <section className="rounded-lg border border-content-400/20 bg-base-200 p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl text-content-100">{t("LLM services")}</h2>
          <p className="mt-1 text-sm text-content-300">
            {t("Connect language models for segmentation and character recognition")}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon />
          {t("Add service")}
        </Button>
      </header>

      {showSkeleton ? (
        <ul className="flex flex-col gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <ServiceSkeleton key={i} />
          ))}
        </ul>
      ) : isLoading ? null : services.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-content-400/15 py-12 text-content-400">
          <p className="text-sm">{t("Add an LLM service to get started")}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {services.map((svc) => {
            const canSync = supportsModelSync(svc.type);
            const syncing = syncingId === svc.id;
            return (
              <li
                key={svc.id}
                className={cn(
                  "flex items-center gap-3 rounded-md border border-content-400/15 bg-base-300 px-4 py-3",
                  !svc.enabled && "opacity-60",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-base text-content-100">{svc.name}</h3>
                    <Badge variant="secondary" className="shrink-0">
                      {TYPE_LABELS[svc.type]}
                    </Badge>
                  </div>
                  <p
                    className="mt-0.5 truncate font-mono text-xs text-content-300"
                    title={svc.baseUrl}
                  >
                    {svc.baseUrl}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {canSync && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => syncMut.mutate(svc.id)}
                      disabled={syncing || !svc.enabled}
                    >
                      <RefreshCcwIcon className={cn(syncing && "animate-spin")} />
                      {syncing ? t("Syncing…") : t("Sync models")}
                    </Button>
                  )}
                  <Switch
                    value={svc.enabled ?? false}
                    onChange={(enabled) => toggleMut.mutate({ id: svc.id, enabled })}
                    size="sm"
                    aria-label={svc.enabled ? t("Disable") : t("Enable")}
                  />
                  <Dropdown
                    align="end"
                    items={[
                      {
                        key: "edit",
                        label: t("Edit"),
                        icon: <PencilIcon />,
                        onSelect: () => setEditing(svc),
                      },
                      { type: "separator" },
                      {
                        key: "delete",
                        label: t("Delete"),
                        icon: <TrashIcon />,
                        danger: true,
                        onSelect: () => setConfirmingDelete(svc),
                      },
                    ]}
                  >
                    <Button variant="ghost" size="sm" shape="circle" aria-label={t("More actions")}>
                      <MoreHorizontalIcon />
                    </Button>
                  </Dropdown>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <LLMServiceDialog
        open={creating || !!editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        service={editing}
      />

      <Dialog
        open={!!confirmingDelete}
        onOpenChange={(open) => {
          if (!open && !deleteMut.isPending) setConfirmingDelete(null);
        }}
        title={t("Delete LLM service?")}
        description={
          confirmingDelete
            ? t("“{0}” and its models will be permanently deleted.", confirmingDelete.name)
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

function ServiceSkeleton() {
  return (
    <li className="flex items-center gap-3 rounded-md border border-content-400/15 bg-base-300 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-16 rounded-sm" />
        </div>
        <Skeleton className="h-3 w-3/4" />
      </div>
      <Skeleton className="h-6 w-20 shrink-0 rounded-md" />
      <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
      <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
    </li>
  );
}
