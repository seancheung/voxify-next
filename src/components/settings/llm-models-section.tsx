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
        title: "更新失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["llm-models"] });
      setConfirmingDelete(null);
      toast.success("已删除模型");
    },
    onError: (err) =>
      toast.error({
        title: "删除失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  return (
    <section className="rounded-lg border border-content-400/20 bg-base-200 p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl text-content-100">LLM 模型</h2>
          <p className="mt-1 text-sm text-content-300">
            服务下属的具体模型；可手动添加，也会被服务的同步操作覆盖
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon />
          添加模型
        </Button>
      </header>

      {showSkeleton ? (
        <ModelsSkeleton />
      ) : isLoading ? null : models.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-content-400/15 py-12 text-content-400">
          <p className="text-sm">还没有模型，点击右上角添加或先在服务上同步</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>服务</TableHead>
              <TableHead>模型 ID</TableHead>
              <TableHead>显示名</TableHead>
              <TableHead>备注</TableHead>
              <TableHead className="w-24">启用</TableHead>
              <TableHead className="w-12 text-right">操作</TableHead>
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
                    aria-label={m.enabled ? "禁用" : "启用"}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Dropdown
                    align="end"
                    items={[
                      {
                        key: "edit",
                        label: "编辑",
                        icon: <PencilIcon />,
                        onSelect: () => setEditing(m),
                      },
                      { type: "separator" },
                      {
                        key: "delete",
                        label: "删除",
                        icon: <TrashIcon />,
                        danger: true,
                        onSelect: () => setConfirmingDelete(m),
                      },
                    ]}
                  >
                    <Button variant="ghost" size="sm" shape="circle" aria-label="更多操作">
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
        title="确认删除模型"
        description={
          confirmingDelete
            ? `模型 “${confirmingDelete.name}” 将被删除。如果该模型来自服务同步，下次同步会重新加回。`
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

function ModelsSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>服务</TableHead>
          <TableHead>模型 ID</TableHead>
          <TableHead>显示名</TableHead>
          <TableHead>备注</TableHead>
          <TableHead className="w-24">启用</TableHead>
          <TableHead className="w-12 text-right">操作</TableHead>
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
