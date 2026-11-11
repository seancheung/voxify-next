import {
  CircleCheckIcon,
  CopyIcon,
  GripVerticalIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PencilIcon,
  TrashIcon,
} from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import Dropdown from "@/components/ui/dropdown";
import type { ChapterListItem as ChapterRow } from "@/lib/chapters.functions";
import { cn } from "@/utils/cn";

export default function ChapterListItem({
  chapter,
  index,
  isSelected,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete,
  onDragEnd,
}: {
  chapter: ChapterRow;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDragEnd: () => void;
}) {
  const dragControls = useDragControls();
  const isComplete = chapter.segmentCount > 0 && chapter.generatedCount >= chapter.segmentCount;
  // Complete + any stale segment = info; complete + none stale = success.
  // Anything less than fully generated shows nothing.
  const status: "ok" | "stale" | null = isComplete
    ? chapter.staleCount > 0
      ? "stale"
      : "ok"
    : null;

  return (
    <Reorder.Item
      value={chapter}
      dragListener={false}
      dragControls={dragControls}
      onDragEnd={onDragEnd}
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "group flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1.5 text-sm transition-colors",
        isSelected
          ? "bg-primary-500/15 text-primary-500"
          : "text-content-200 hover:bg-base-400 hover:text-content-100",
      )}
      onPointerDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("[data-no-select]")) return;
        onSelect();
      }}
    >
      <div className="relative size-5 shrink-0">
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center font-mono text-xs tabular-nums transition-opacity group-hover:opacity-0",
            isSelected ? "text-primary-500/40" : "text-content-400",
          )}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <button
          type="button"
          aria-label="拖动排序"
          data-no-select
          onPointerDown={(event) => {
            event.preventDefault();
            dragControls.start(event);
          }}
          className="absolute inset-0 flex cursor-grab touch-none items-center justify-center text-content-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-content-200 active:cursor-grabbing"
        >
          <GripVerticalIcon className="size-3.5" />
        </button>
      </div>
      <span className="min-w-0 flex-1 truncate">{chapter.name}</span>
      <div data-no-select className="relative size-6 shrink-0">
        {status && (
          <span
            aria-label={status === "stale" ? "已生成但有更新" : "已完成生成"}
            className={cn(
              "pointer-events-none absolute inset-0 flex items-center justify-center opacity-70 transition-opacity group-hover:opacity-0",
            )}
          >
            {status === "stale" ? (
              <InfoIcon className="size-4" />
            ) : (
              <CircleCheckIcon className="size-4" />
            )}
          </span>
        )}
        <Dropdown
          align="end"
          items={[
            {
              key: "edit",
              label: "编辑",
              icon: <PencilIcon />,
              onSelect: onEdit,
            },
            {
              key: "duplicate",
              label: "复制",
              icon: <CopyIcon />,
              onSelect: onDuplicate,
            },
            { type: "separator" },
            {
              key: "delete",
              label: "删除",
              icon: <TrashIcon />,
              danger: true,
              onSelect: onDelete,
            },
          ]}
        >
          <button
            type="button"
            aria-label="更多操作"
            className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full text-content-300 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-base-400 hover:text-content-100 aria-expanded:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontalIcon className="size-4" />
          </button>
        </Dropdown>
      </div>
    </Reorder.Item>
  );
}
