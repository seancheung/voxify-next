import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontalIcon, PencilIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import LLMModelDialog from "@/components/settings/llm-model-dialog";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import Dropdown from "@/components/ui/dropdown";
import Skeleton from "@/components/ui/skeleton";
import Switch from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { t } from "@/i18n";
import {
  deleteLLMModel,
  type LLMModelListItem,
  listLLMModels,
  toggleLLMModel,
} from "@/lib/llm-models.functions";
import { LLMType } from "@/types/llm";
import { cn } from "@/utils/cn";

const TYPE_LABELS: Record<LLMType, string> = {
  [LLMType.OpenAI]: "OpenAI",
  [LLMType.Anthropic]: "Anthropic",
  [LLMType.GoogleGenerativeAI]: "Google Gen AI",
  [LLMType.Ollama]: "Ollama",
  [LLMType.DeepSeek]: "DeepSeek",
};

export default function LLMModelsSection() {
  const fetchList = useServerFn(listLLMModels);
  const toggleFn = useServerFn(toggleLLMModel);
  const deleteFn = useServerFn(deleteLLMModel);
  const qc = useQueryClient();

  const [editing, setEditing] = useState<LLMModelListItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<LLMModelListItem | null>(null);

  const { data: models = [], isLoading } = useQuery({
    queryKey: ["llm-models"],
    queryFn: () => fetchList(),
  });
  const showSkeleton = useDelayedFlag(isLoading);

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      toggleFn({ data: { id, enabled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["llm-models"] }),
    onError: (err) =>
      toast.error({
        title: t("Update failed"),
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["llm-models"] });
      setConfirmingDelete(null);
      toast.success(t("Model deleted"));
    },
    onError: (err) =>
      toast.error({
        title: t("Deletion failed"),
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  return (
    <section className="rounded-lg border border-content-400/20 bg-base-200 p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl text-content-100">{t("LLM model")}</h2>
          <p className="mt-1 text-sm text-content-300">
            {t("Models belonging to each service. Syncing a service replaces manual changes.")}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon />
          {t("Add model")}
        </Button>
      </header>

      {showSkeleton ? (
        <ModelsSkeleton />
      ) : isLoading ? null : models.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-content-400/15 py-12 text-content-400">
          <p className="text-sm">{t("Add a model or sync a service to get started")}</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Service")}</TableHead>
              <TableHead>{t("Model ID")}</TableHead>
              <TableHead>{t("Display name")}</TableHead>
              <TableHead>{t("Notes")}</TableHead>
              <TableHead className="w-24">{t("Enable")}</TableHead>
              <TableHead className="w-12 text-right">{t("Actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {models.map((m) => (
              <TableRow key={m.id} className={cn(!m.enabled && "opacity-60")}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-content-100">{m.llmServiceName}</span>
                    <Badge variant="secondary" size="sm" className="shrink-0">
                      {TYPE_LABELS[m.llmServiceType]}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-content-200">{m.key}</TableCell>
                <TableCell className="text-content-100">{m.name}</TableCell>
                <TableCell className="text-content-300">
                  {m.description ? (
                    <span title={m.description} className="line-clamp-1">
                      {m.description}
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  <Switch
                    value={m.enabled ?? false}
                    onChange={(enabled) => toggleMut.mutate({ id: m.id, enabled })}
                    size="sm"
                    aria-label={m.enabled ? t("Disable") : t("Enable")}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Dropdown
                    align="end"
                    items={[
                      {
                        key: "edit",
                        label: t("Edit"),
                        icon: <PencilIcon />,
                        onSelect: () => setEditing(m),
                      },
                      { type: "separator" },
                      {
                        key: "delete",
                        label: t("Delete"),
                        icon: <TrashIcon />,
                        danger: true,
                        onSelect: () => setConfirmingDelete(m),
                      },
                    ]}
                  >
                    <Button variant="ghost" size="sm" shape="circle" aria-label={t("More actions")}>
                      <MoreHorizontalIcon />
                    </Button>
                  </Dropdown>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <LLMModelDialog
        open={creating || !!editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        model={editing}
      />

      <Dialog
        open={!!confirmingDelete}
        onOpenChange={(open) => {
          if (!open && !deleteMut.isPending) setConfirmingDelete(null);
        }}
        title={t("Delete model?")}
        description={
          confirmingDelete
            ? t(
                "“{0}” will be deleted. Models from a service will return on the next sync.",
                confirmingDelete.name,
              )
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

function ModelsSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("Service")}</TableHead>
          <TableHead>{t("Model ID")}</TableHead>
          <TableHead>{t("Display name")}</TableHead>
          <TableHead>{t("Notes")}</TableHead>
          <TableHead className="w-24">{t("Enable")}</TableHead>
          <TableHead className="w-12 text-right">{t("Actions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 3 }, (_, i) => (
          <TableRow key={i}>
            <TableCell>
              <Skeleton className="h-4 w-24" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-32" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-24" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-40" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-5 w-9 rounded-full" />
            </TableCell>
            <TableCell className="text-right">
              <Skeleton className="ml-auto h-8 w-8 rounded-full" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
