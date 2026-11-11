import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RotateCcwIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import SectionCard from "@/components/settings/section-card";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
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
import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import {
  type DeletedProjectListItem,
  listDeletedProjects,
  purgeProject,
  restoreProject,
} from "@/lib/projects.functions";
import { relativeTime } from "@/utils/datetime";

type ConfirmAction =
  | { type: "restore"; project: DeletedProjectListItem }
  | { type: "purge"; project: DeletedProjectListItem };

export default function RecycleBinSection() {
  const fetchList = useServerFn(listDeletedProjects);
  const restoreFn = useServerFn(restoreProject);
  const purgeFn = useServerFn(purgeProject);
  const qc = useQueryClient();

  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["deleted-projects"],
    queryFn: () => fetchList(),
  });
  const showSkeleton = useDelayedFlag(isLoading);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["deleted-projects"] });
    qc.invalidateQueries({ queryKey: ["global-stats"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
  };

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
        r.deletedFiles > 0 ? `已永久删除项目，并清理 ${r.deletedFiles} 个文件` : "已永久删除项目",
      );
    },
    onError: (err) =>
      toast.error({
        title: "删除失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const isPending = restoreMut.isPending || purgeMut.isPending;

  return (
    <SectionCard
      title="回收站"
      description="此处列出已删除的项目，可恢复或永久删除。永久删除会一并移除项目占用的所有文件。"
    >
      {showSkeleton ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isLoading ? null : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-content-400/15 py-12 text-content-400">
          <p className="text-sm">回收站为空</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>作者</TableHead>
              <TableHead>删除时间</TableHead>
              <TableHead>占用</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="text-content-100">{p.name}</TableCell>
                <TableCell className="text-content-300">{p.author ?? "—"}</TableCell>
                <TableCell className="text-content-300">{relativeTime(p.deletedAt)}</TableCell>
                <TableCell className="text-content-300">
                  {p.fileCount > 0 ? `${p.fileCount} 个 · ${formatBytes(p.fileSize)}` : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => setConfirm({ type: "restore", project: p })}
                    >
                      <RotateCcwIcon />
                      恢复
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={isPending}
                      onClick={() => setConfirm({ type: "purge", project: p })}
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
      )}

      <Dialog
        open={confirm?.type === "restore"}
        onOpenChange={(open) => {
          if (!open && !restoreMut.isPending) setConfirm(null);
        }}
        title="确认恢复项目"
        description={
          confirm?.type === "restore"
            ? `项目 “${confirm.project.name}” 将被恢复并重新出现在项目列表中。`
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
                restoreMut.mutate(confirm.project.id);
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
        title="确认永久删除项目"
        description={
          confirm?.type === "purge"
            ? `项目 “${confirm.project.name}” 及其全部章节、片段、合成音频、素材与导出${
                confirm.project.fileCount > 0
                  ? `（共 ${confirm.project.fileCount} 个文件 · ${formatBytes(confirm.project.fileSize)}）`
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
                purgeMut.mutate(confirm.project.id);
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
