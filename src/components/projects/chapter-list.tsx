import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PlusIcon } from "lucide-react";
import { AnimatePresence, Reorder } from "motion/react";
import { useEffect, useState } from "react";
import ChapterDialog from "@/components/projects/chapter-dialog";
import ChapterListItem from "@/components/projects/chapter-list-item";
import Button from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  type ChapterListItem as ChapterRow,
  deleteChapter,
  duplicateChapter,
  reorderChapters,
  restoreChapter,
} from "@/lib/chapters.functions";

export default function ChapterList({
  projectId,
  chapters,
  selectedId,
  onSelect,
  onCreated,
}: {
  projectId: number;
  chapters: ChapterRow[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreated?: (chapter: ChapterRow) => void;
}) {
  const qc = useQueryClient();
  const reorderFn = useServerFn(reorderChapters);
  const removeFn = useServerFn(deleteChapter);
  const restoreFn = useServerFn(restoreChapter);
  const dupFn = useServerFn(duplicateChapter);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ChapterRow | null>(null);
  const [order, setOrder] = useState<ChapterRow[]>(chapters);

  useEffect(() => {
    setOrder(chapters);
  }, [chapters]);

  const reorderMut = useMutation({
    mutationFn: (ids: number[]) => reorderFn({ data: { projectId, ids } }),
    onError: (err) => {
      qc.invalidateQueries({ queryKey: ["chapters", projectId] });
      toast.error({
        title: "排序失败",
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });

  const restoreMut = useMutation({
    mutationFn: (id: number) => restoreFn({ data: { id } }),
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

  const removeMut = useMutation({
    mutationFn: (id: number) => removeFn({ data: { id } }),
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

  const dupMut = useMutation({
    mutationFn: (id: number) => dupFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chapters", projectId] });
    },
    onError: (err) =>
      toast.error({
        title: "复制失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  function handleReorderEnd() {
    const nextIds = order.map((c) => c.id);
    const initialIds = chapters.map((c) => c.id);
    if (nextIds.length === initialIds.length && nextIds.every((id, i) => id === initialIds[i])) {
      return;
    }
    reorderMut.mutate(nextIds);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-content-400/15 px-3">
        <h2 className="text-xs font-normal text-content-300">章节 · {chapters.length}</h2>
        <Button
          variant="ghost"
          size="sm"
          shape="square"
          aria-label="新建章节"
          onClick={() => setCreating(true)}
        >
          <PlusIcon />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {order.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center text-xs text-content-400">
            <p>还没有章节</p>
            <Button size="sm" onClick={() => setCreating(true)}>
              <PlusIcon />
              新建章节
            </Button>
          </div>
        ) : (
          <Reorder.Group
            axis="y"
            values={order}
            onReorder={setOrder}
            className="flex flex-col gap-1"
          >
            <AnimatePresence initial={false}>
              {order.map((chapter, index) => (
                <ChapterListItem
                  key={chapter.id}
                  chapter={chapter}
                  index={index}
                  isSelected={chapter.id === selectedId}
                  onSelect={() => onSelect(chapter.id)}
                  onEdit={() => setEditing(chapter)}
                  onDuplicate={() => dupMut.mutate(chapter.id)}
                  onDelete={() => removeMut.mutate(chapter.id)}
                  onDragEnd={handleReorderEnd}
                />
              ))}
            </AnimatePresence>
          </Reorder.Group>
        )}
      </div>
      <ChapterDialog
        projectId={projectId}
        chapter={null}
        open={creating}
        onOpenChange={setCreating}
        onCreated={onCreated}
      />
      <ChapterDialog
        projectId={projectId}
        chapter={editing}
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />
    </div>
  );
}
