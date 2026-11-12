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
import { t } from "@/i18n";
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
          ? t("Permanently deleted the project and {0} files", r.deletedFiles)
          : t("Project permanently deleted"),
      );
    },
    onError: (err) =>
      toast.error({
        title: t("Deletion failed"),
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const isPending = restoreMut.isPending || purgeMut.isPending;

  return (
    <SectionCard
      title={t("Recycle bin")}
      description={t(
        "Restore or permanently delete projects. Permanent deletion removes all files belonging to the project.",
      )}
    >
      {showSkeleton ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isLoading ? null : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-content-400/15 py-12 text-content-400">
          <p className="text-sm">{t("Recycle bin is empty")}</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Name")}</TableHead>
              <TableHead>{t("Author")}</TableHead>
              <TableHead>{t("Deleted at")}</TableHead>
              <TableHead>{t("Storage used")}</TableHead>
              <TableHead className="text-right">{t("Actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="text-content-100">{p.name}</TableCell>
                <TableCell className="text-content-300">{p.author ?? "—"}</TableCell>
                <TableCell className="text-content-300">{relativeTime(p.deletedAt)}</TableCell>
                <TableCell className="text-content-300">
                  {p.fileCount > 0
                    ? t("{0} items · {1}", p.fileCount, formatBytes(p.fileSize))
                    : "—"}
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
                      {t("Restore")}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={isPending}
                      onClick={() => setConfirm({ type: "purge", project: p })}
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
      )}

      <Dialog
        open={confirm?.type === "restore"}
        onOpenChange={(open) => {
          if (!open && !restoreMut.isPending) setConfirm(null);
        }}
        title={t("Restore project?")}
        description={
          confirm?.type === "restore"
            ? t("“{0}” will return to the project list.", confirm.project.name)
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
                restoreMut.mutate(confirm.project.id);
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
        title={t("Permanently delete project?")}
        description={
          confirm?.type === "purge"
            ? t(
                "“{0}” and all its chapters, segments, audio, assets and exports{1} will be permanently removed from storage.",
                confirm.project.name,
                confirm.project.fileCount > 0
                  ? t(
                      " ({0} files · {1})",
                      confirm.project.fileCount,
                      formatBytes(confirm.project.fileSize),
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
                purgeMut.mutate(confirm.project.id);
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
