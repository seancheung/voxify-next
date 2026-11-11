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
        title: "更新失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prompts"] });
      setConfirmingDelete(null);
      toast.success("已删除提示词");
    },
    onError: (err) =>
      toast.error({
        title: "删除失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const importDefaultsMut = useMutation({
    mutationFn: () => importDefaultsFn(),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["prompts"] });
      toast.success(`已导入 ${result.inserted} 条默认提示词`);
    },
    onError: (err) =>
      toast.error({
        title: "导入失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  return (
    <section className="rounded-lg border border-content-400/20 bg-base-200 p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl text-content-100">提示词</h2>
          <p className="mt-1 text-sm text-content-300">
            可复用的 LLM 提示词模板，项目级别可选择具体使用哪一条
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon />
          添加提示词
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
          <p className="text-sm">还没有提示词，点击右上角添加</p>
          <p className="text-xs text-content-400/80">
            或者导入内置的默认提示词（中英文 · 分段 / 角色识别 共 4 条）
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => importDefaultsMut.mutate()}
            disabled={importDefaultsMut.isPending}
          >
            <DownloadIcon />
            {importDefaultsMut.isPending ? "导入中…" : "导入默认提示词"}
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
                  aria-label={p.enabled ? "禁用" : "启用"}
                />
                <Dropdown
                  align="end"
                  items={[
                    {
                      key: "edit",
                      label: "编辑",
                      icon: <PencilIcon />,
                      onSelect: () => setEditing(p),
                    },
                    { type: "separator" },
                    {
                      key: "delete",
                      label: "删除",
                      icon: <TrashIcon />,
                      danger: true,
                      onSelect: () => setConfirmingDelete(p),
                    },
                  ]}
                >
                  <Button variant="ghost" size="sm" shape="circle" aria-label="更多操作">
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
        title="确认删除提示词"
        description={
          confirmingDelete
            ? `提示词 “${confirmingDelete.name}” 将被删除，操作不可撤销。`
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
