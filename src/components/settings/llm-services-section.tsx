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
        title: "更新失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["llm-services"] });
      qc.invalidateQueries({ queryKey: ["llm-models"] });
      setConfirmingDelete(null);
      toast.success("已删除 LLM 服务");
    },
    onError: (err) =>
      toast.error({
        title: "删除失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const syncMut = useMutation({
    mutationFn: (id: number) => syncFn({ data: { id } }),
    onMutate: (id: number) => setSyncingId(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["llm-models"] });
      toast.success({
        title: "模型已同步",
        description: `共 ${res.total} 个，新增 ${res.added}、更新 ${res.updated}、移除 ${res.removed}`,
      });
    },
    onError: (err) =>
      toast.error({
        title: "同步失败",
        description: err instanceof Error ? err.message : String(err),
      }),
    onSettled: () => setSyncingId(null),
  });

  return (
    <section className="rounded-lg border border-content-400/20 bg-base-200 p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl text-content-100">LLM 服务</h2>
          <p className="mt-1 text-sm text-content-300">
            连接大语言模型用于文本拆分、角色识别等任务
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon />
          添加服务
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
          <p className="text-sm">还没有 LLM 服务，点击右上角添加</p>
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
                      {syncing ? "同步中…" : "同步模型"}
                    </Button>
                  )}
                  <Switch
                    value={svc.enabled ?? false}
                    onChange={(enabled) => toggleMut.mutate({ id: svc.id, enabled })}
                    size="sm"
                    aria-label={svc.enabled ? "禁用" : "启用"}
                  />
                  <Dropdown
                    align="end"
                    items={[
                      {
                        key: "edit",
                        label: "编辑",
                        icon: <PencilIcon />,
                        onSelect: () => setEditing(svc),
                      },
                      { type: "separator" },
                      {
                        key: "delete",
                        label: "删除",
                        icon: <TrashIcon />,
                        danger: true,
                        onSelect: () => setConfirmingDelete(svc),
                      },
                    ]}
                  >
                    <Button variant="ghost" size="sm" shape="circle" aria-label="更多操作">
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
        title="确认删除 LLM 服务"
        description={
          confirmingDelete
            ? `服务 “${confirmingDelete.name}” 及其下属模型将被删除，操作不可撤销。`
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
              取消
            </Button>
            <Button
              variant="danger"
              disabled={deleteMut.isPending}
              onClick={() => {
                if (confirmingDelete) deleteMut.mutate(confirmingDelete.id);
              }}
            >
              {deleteMut.isPending ? "删除中…" : "确认删除"}
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
