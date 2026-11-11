import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AudioLinesIcon,
  ClockIcon,
  DownloadIcon,
  FlagIcon,
  HistoryIcon,
  InfoIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlayIcon,
  RefreshCwIcon,
  SquareIcon,
  TagIcon,
  UsersIcon,
  XIcon,
  ZapIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import SegmentAudioDialog from "@/components/projects/segment-audio-dialog";
import SegmentEditDialog from "@/components/projects/segment-edit-dialog";
import SegmentHistoryDialog from "@/components/projects/segment-history-dialog";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import Checkbox from "@/components/ui/checkbox";
import Dialog from "@/components/ui/dialog";
import Dropdown, { type DropdownItem } from "@/components/ui/dropdown";
import Select, { type SelectOption } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import Tooltip from "@/components/ui/tooltip";
import { usePreviewPlayer } from "@/hooks/use-preview-player";
import { useTTSSegmentStates } from "@/hooks/use-tts-segment-states";
import { type ChapterListItem, getProject } from "@/lib/chapters.functions";
import { getAppConfig } from "@/lib/configs.functions";
import { listNarrators } from "@/lib/narrators.functions";
import {
  enqueueSegments,
  getSegmentGenerationInfo,
  getSegmentGenerationUrl,
  getSegmentGenerationUrlsBatch,
  listSegmentsByChapter,
  markSegmentStale,
  type SegmentGenerationInfo,
  type SegmentListItem,
  setSegmentNarrators,
} from "@/lib/segments.functions";
import { cn } from "@/utils/cn";
import { formatDuration } from "@/utils/duration";
import { narratorColor } from "@/utils/narrator-color";

type SegmentStatus = "queued" | "generating" | "failed" | "done" | "stale" | "not-generated";

type SegmentLiveState = "active" | "pending" | "failed" | null;

const STATUS_LABEL: Record<SegmentStatus, string> = {
  queued: "队列中",
  generating: "生成中",
  failed: "已失败",
  done: "已生成",
  stale: "有更新",
  "not-generated": "未生成",
};

const STATUS_VARIANT: Record<
  SegmentStatus,
  "info" | "primary" | "error" | "success" | "warning" | "secondary"
> = {
  queued: "info",
  generating: "primary",
  failed: "error",
  done: "success",
  stale: "warning",
  "not-generated": "secondary",
};

const STATUS_FILTER_OPTIONS: SelectOption<SegmentStatus | "all">[] = [
  { value: "all", label: "全部状态" },
  { value: "queued", label: STATUS_LABEL.queued },
  { value: "generating", label: STATUS_LABEL.generating },
  { value: "failed", label: STATUS_LABEL.failed },
  { value: "done", label: STATUS_LABEL.done },
  { value: "stale", label: STATUS_LABEL.stale },
  { value: "not-generated", label: STATUS_LABEL["not-generated"] },
];

const ROW_HEIGHT = 52;
const NARRATOR_FILTER_ALL = -1;
const NARRATOR_FILTER_NONE = 0;

const COLUMN_TEMPLATE = "grid-cols-[2.5rem_4rem_8rem_minmax(0,1fr)_6rem_8rem]";

function deriveStatus(segment: SegmentListItem, liveState: SegmentLiveState): SegmentStatus {
  if (liveState === "active") return "generating";
  if (liveState === "pending") return "queued";
  if (liveState === "failed") return "failed";
  if (segment.hasGeneration) return segment.isStale ? "stale" : "done";
  return "not-generated";
}

function isRegeneratable(status: SegmentStatus): boolean {
  return (
    status === "failed" || status === "stale" || status === "not-generated" || status === "done"
  );
}

export default function SegmentsPanel({ chapter }: { chapter: ChapterListItem }) {
  const qc = useQueryClient();
  const fetchSegments = useServerFn(listSegmentsByChapter);
  const fetchNarrators = useServerFn(listNarrators);
  const enqueueFn = useServerFn(enqueueSegments);
  const markStaleFn = useServerFn(markSegmentStale);
  const fetchSingleUrl = useServerFn(getSegmentGenerationUrl);
  const fetchBatchUrls = useServerFn(getSegmentGenerationUrlsBatch);
  const setNarratorsFn = useServerFn(setSegmentNarrators);

  const { data: segments = [] } = useQuery({
    queryKey: ["segments", chapter.id],
    queryFn: () => fetchSegments({ data: { chapterId: chapter.id } }),
  });

  const { data: narratorData } = useQuery({
    queryKey: ["narrators", chapter.projectId],
    queryFn: () => fetchNarrators({ data: { projectId: chapter.projectId } }),
  });
  const narratorList = narratorData?.items ?? [];

  const segmentStates = useTTSSegmentStates(true);
  const activeSet = new Set(segmentStates.active);
  const pendingSet = new Set(segmentStates.pending);
  const failedSet = new Set(segmentStates.failed);

  function liveStateOf(segmentId: number): SegmentLiveState {
    if (activeSet.has(segmentId)) return "active";
    if (pendingSet.has(segmentId)) return "pending";
    if (failedSet.has(segmentId)) return "failed";
    return null;
  }

  // Detect completions by diffing the live (active + pending) set against
  // the previous push: any segmentId that left the live set without
  // landing in `failed` must have completed, so refetch segments + mix to
  // pick up the new generationId / cleared isStale flag.
  const prevLiveRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const live = new Set<number>([...segmentStates.active, ...segmentStates.pending]);
    const failedNow = new Set<number>(segmentStates.failed);
    let hasCompletion = false;
    for (const id of prevLiveRef.current) {
      if (!live.has(id) && !failedNow.has(id)) {
        hasCompletion = true;
        break;
      }
    }
    prevLiveRef.current = live;
    if (hasCompletion) {
      qc.invalidateQueries({ queryKey: ["segments", chapter.id] });
      // The chapter list's completion indicator is derived from segment
      // counts on each row, so refresh it when generations finish.
      qc.invalidateQueries({ queryKey: ["chapters", chapter.projectId] });
    }
  }, [segmentStates, qc, chapter.id, chapter.projectId]);

  const [statusFilter, setStatusFilter] = useState<SegmentStatus | "all">("all");
  const [narratorFilter, setNarratorFilter] = useState<number>(NARRATOR_FILTER_ALL);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rerun, setRerun] = useState(false);
  const [editingSegment, setEditingSegment] = useState<SegmentListItem | null>(null);
  const [audioSegment, setAudioSegment] = useState<SegmentListItem | null>(null);
  const [historySegment, setHistorySegment] = useState<SegmentListItem | null>(null);
  const [generationInfo, setGenerationInfo] = useState<SegmentGenerationInfo | null>(null);

  const fetchGenerationInfo = useServerFn(getSegmentGenerationInfo);
  function handleViewInfo(segment: SegmentListItem) {
    if (!segment.generationId) return;
    fetchGenerationInfo({ data: { id: segment.generationId } }).then(setGenerationInfo, (err) =>
      toast.error({
        title: "获取信息失败",
        description: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  // Anchor for shift-click range selection — tracks the last single-click
  // target so the next shift-click can extend a range from there.
  const lastSelectedIdRef = useRef<number | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: clear selection on filter change
  useEffect(() => {
    setSelected(new Set());
    lastSelectedIdRef.current = null;
  }, [statusFilter, narratorFilter]);

  const total = segments.length;
  const indexPad = String(Math.max(total, 1)).length;

  const indexById = new Map<number, number>();
  for (let i = 0; i < segments.length; i++) {
    indexById.set(segments[i].id, i + 1);
  }

  // Declared up here so the assignment after filteredSegments works; the ref
  // is consumed in the playback chain logic further down.
  const filteredSegmentsRef = useRef<SegmentListItem[]>([]);

  const filteredSegments = segments.filter((segment) => {
    if (statusFilter !== "all") {
      const status = deriveStatus(segment, liveStateOf(segment.id));
      if (status !== statusFilter) return false;
    }
    if (narratorFilter !== NARRATOR_FILTER_ALL) {
      const segNarratorId = segment.narratorId ?? NARRATOR_FILTER_NONE;
      if (segNarratorId !== narratorFilter) return false;
    }
    return true;
  });
  filteredSegmentsRef.current = filteredSegments;

  const filteredIds = filteredSegments.map((s) => s.id);

  // drop selection entries that are no longer visible
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(filteredIds);
      const next = new Set<number>();
      for (const id of prev) if (visible.has(id)) next.add(id);
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [filteredIds]);

  const allFilteredSelected =
    filteredSegments.length > 0 && selected.size >= filteredSegments.length;

  function toggleSelectAll(next: boolean) {
    if (next) setSelected(new Set(filteredIds));
    else setSelected(new Set());
  }

  function toggleSelect(id: number, next: boolean, shiftKey: boolean) {
    const list = filteredSegmentsRef.current;
    const anchorId = lastSelectedIdRef.current;
    if (shiftKey && anchorId != null && anchorId !== id) {
      const anchorIdx = list.findIndex((s) => s.id === anchorId);
      const targetIdx = list.findIndex((s) => s.id === id);
      if (anchorIdx >= 0 && targetIdx >= 0) {
        const [start, end] =
          anchorIdx < targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
        setSelected((prev) => {
          const out = new Set(prev);
          for (let i = start; i <= end; i++) {
            if (next) out.add(list[i].id);
            else out.delete(list[i].id);
          }
          return out;
        });
        lastSelectedIdRef.current = id;
        return;
      }
    }
    setSelected((prev) => {
      const out = new Set(prev);
      if (next) out.add(id);
      else out.delete(id);
      return out;
    });
    lastSelectedIdRef.current = id;
  }

  const enqueueMut = useMutation({
    mutationFn: (segmentIds: number[]) => enqueueFn({ data: { segmentIds } }),
    onSuccess: ({ enqueued, skipped }, variables) => {
      qc.invalidateQueries({ queryKey: ["segments", chapter.id] });
      qc.invalidateQueries({ queryKey: ["tts-jobs-summary"] });
      // Single-segment enqueues come from the per-row regen button; the row's
      // own status badge updates to "队列中" immediately so a toast is noise.
      // Only surface the toast for batch enqueues.
      if (variables.length <= 1) return;
      if (enqueued > 0) {
        toast.success(
          skipped > 0
            ? `已加入 ${enqueued} 条，跳过 ${skipped} 条已在队列中的段落`
            : `已加入 ${enqueued} 条`,
        );
      }
    },
    onError: (err) => {
      toast.error({
        title: "加入队列失败",
        description: err instanceof Error ? err.message : String(err),
      });
      console.error(err);
    },
  });

  const markStaleMut = useMutation({
    mutationFn: (id: number) => markStaleFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["segments", chapter.id] });
      // staleCount feeds the chapter list status icon.
      qc.invalidateQueries({ queryKey: ["chapters", chapter.projectId] });
      toast.success("已标记过期");
    },
    onError: (err) =>
      toast.error({
        title: "操作失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const setNarratorsMut = useMutation({
    mutationFn: ({ segmentIds, narratorId }: { segmentIds: number[]; narratorId: number | null }) =>
      setNarratorsFn({ data: { segmentIds, narratorId } }),
    onSuccess: ({ updated }) => {
      qc.invalidateQueries({ queryKey: ["segments", chapter.id] });
      // staleCount feeds the chapter list status icon — narrator changes
      // mark every affected segment stale.
      qc.invalidateQueries({ queryKey: ["chapters", chapter.projectId] });
      qc.invalidateQueries({ queryKey: ["narrators", chapter.projectId] });
      toast.success(`已更新 ${updated} 个段落的角色`);
    },
    onError: (err) =>
      toast.error({
        title: "设置角色失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  function handleSetNarrator(narratorId: number | null) {
    if (selected.size === 0) return;
    setNarratorsMut.mutate({
      segmentIds: Array.from(selected),
      narratorId,
    });
  }

  function pickEnqueueable(pool: SegmentListItem[]): number[] {
    return pool
      .filter((segment) => {
        const status = deriveStatus(segment, liveStateOf(segment.id));
        if (status === "queued" || status === "generating") return false;
        if (status === "done" && !rerun) return false;
        return isRegeneratable(status);
      })
      .map((s) => s.id);
  }

  function handleGenerate() {
    const pool = selected.size > 0 ? segments.filter((s) => selected.has(s.id)) : filteredSegments;
    const ids = pickEnqueueable(pool);
    if (ids.length === 0) return;
    enqueueMut.mutate(ids);
  }

  function handleSingleEnqueue(segment: SegmentListItem) {
    enqueueMut.mutate([segment.id]);
  }

  function handleClearSelection() {
    setSelected(new Set());
    lastSelectedIdRef.current = null;
  }

  const player = usePreviewPlayer();

  const fetchProject = useServerFn(getProject);
  const fetchAppConfig = useServerFn(getAppConfig);
  const { data: project } = useQuery({
    queryKey: ["project", chapter.projectId],
    queryFn: () => fetchProject({ data: { id: chapter.projectId } }),
  });
  const { data: appConfig } = useQuery({
    queryKey: ["app-config"],
    queryFn: () => fetchAppConfig(),
  });
  const segmentGapMs = project?.settings?.gap ?? appConfig?.defaultSegmentGapMs ?? 0;

  const [continuous, setContinuous] = useState(false);

  // Refs mirroring the latest state so chain decisions read live data when
  // playback ends — see the requirement that the next segment is picked at
  // end-of-playback, not when continuous play starts.
  const continuousRef = useRef(continuous);
  continuousRef.current = continuous;
  const segmentGapMsRef = useRef(segmentGapMs);
  segmentGapMsRef.current = segmentGapMs;
  const chainTimerRef = useRef<number | null>(null);
  // True while we're sitting in the inter-segment gap during continuous play —
  // the previous Howl has ended (so player.playingId is null) but the next
  // one hasn't started yet. Used to keep the "停止播放" button visible across
  // the gap so it doesn't flicker.
  const [chainPending, setChainPending] = useState(false);

  function cancelChain() {
    if (chainTimerRef.current != null) {
      clearTimeout(chainTimerRef.current);
      chainTimerRef.current = null;
    }
    setChainPending(false);
  }

  function startPlay(segment: SegmentListItem) {
    cancelChain();
    const generationId = segment.generationId;
    if (generationId == null) return;
    const playId = `seg-${segment.id}`;
    // Single-play: no silences (neither per-segment nor project / global
    // default gaps) are applied — the audio starts as soon as it's ready
    // and ends when the file ends.
    player.toggle(
      playId,
      async () => {
        const r = await fetchSingleUrl({ data: { id: generationId } });
        return r.url;
      },
      {
        onEnded: () => {
          if (!continuousRef.current) return;
          // Refresh from the live list so silence edits made mid-play and
          // segment additions / removals are picked up at chain time.
          const list = filteredSegmentsRef.current;
          const curIdx = list.findIndex((s) => s.id === segment.id);
          if (curIdx < 0) return;
          let next: SegmentListItem | null = null;
          for (let i = curIdx + 1; i < list.length; i++) {
            if (list[i].generationId != null) {
              next = list[i];
              break;
            }
          }
          if (!next) return;
          const cur = list[curIdx];
          const trailing = cur.trailingSilence ?? segmentGapMsRef.current;
          const leading = next.leadingSilence ?? 0;
          const gap = Math.max(0, trailing + leading);
          if (gap > 0) {
            setChainPending(true);
            chainTimerRef.current = window.setTimeout(() => {
              chainTimerRef.current = null;
              setChainPending(false);
              if (!continuousRef.current) return;
              if (next) startPlay(next);
            }, gap);
          } else {
            startPlay(next);
          }
        },
      },
    );
  }

  function handleStopPlayback() {
    cancelChain();
    player.stop();
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: cancel any pending continuous-play timer on unmount
  useEffect(() => cancelChain, []);

  const [downloadingBatch, setDownloadingBatch] = useState(false);

  async function handleDownloadSelected() {
    const generationIds = segments
      .filter((s) => selected.has(s.id) && s.generationId != null)
      .map((s) => s.generationId as number);
    if (generationIds.length === 0) return;
    setDownloadingBatch(true);
    try {
      const entries = await fetchBatchUrls({ data: { ids: generationIds } });
      if (entries.length === 0) return;
      const { downloadZip } = await import("client-zip");
      const sources = await Promise.all(
        entries.map(async (e) => {
          const resp = await fetch(e.url);
          if (!resp.ok) throw new Error(`下载失败：${e.fileName}`);
          return { name: e.fileName, input: resp };
        }),
      );
      const blob = await downloadZip(sources).blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `segments-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (err) {
      toast.error({
        title: "批量下载失败",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setDownloadingBatch(false);
    }
  }

  async function handleDownloadOne(segment: SegmentListItem) {
    if (segment.generationId == null) return;
    try {
      const r = await fetchSingleUrl({
        data: { id: segment.generationId, download: true },
      });
      window.location.assign(r.url);
    } catch (err) {
      toast.error({
        title: "下载失败",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // virtualization
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredSegments.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    getItemKey: (index) => filteredSegments[index]?.id ?? index,
  });

  const narratorOptions: SelectOption<number>[] = [
    { value: NARRATOR_FILTER_ALL, label: "全部角色" },
    { value: NARRATOR_FILTER_NONE, label: "默认" },
    ...narratorList.map((n) => ({ value: n.id, label: n.name })),
  ];

  const generateLabel = selected.size > 0 ? "生成所选" : "生成全部";

  const narratorMenuItems: DropdownItem[] = [
    {
      key: "default",
      label: "默认（无角色）",
      onSelect: () => handleSetNarrator(null),
    },
  ];
  if (narratorList.length > 0) {
    narratorMenuItems.push({ type: "separator", key: "sep" });
    for (const n of narratorList) {
      narratorMenuItems.push({
        key: `narrator-${n.id}`,
        label: n.name,
        onSelect: () => handleSetNarrator(n.id),
      });
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button color="primary" onClick={handleGenerate} disabled={enqueueMut.isPending}>
          <ZapIcon />
          {generateLabel}
        </Button>
        <Tooltip content="勾选后，已生成的段落也会被加入队列">
          <Checkbox
            value={rerun}
            onChange={setRerun}
            label="重新生成"
            className="text-sm text-content-300"
          />
        </Tooltip>
        <div className="h-5 w-px bg-content-400/15" />
        <Tooltip content="勾选后，从点击的段落开始按列表顺序连播已生成的段落，每段间隔使用项目设置（未设置则用全局默认）">
          <Checkbox
            value={continuous}
            onChange={setContinuous}
            label="连续播放"
            className="text-sm text-content-300"
          />
        </Tooltip>
        {(player.playingId || chainPending) && (
          <Button variant="ghost" onClick={handleStopPlayback}>
            <SquareIcon />
            停止播放
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Select<SegmentStatus | "all">
            options={STATUS_FILTER_OPTIONS}
            value={statusFilter}
            onChange={setStatusFilter}
            className="min-w-36"
          />
          <Select<number>
            icon={<TagIcon />}
            options={narratorOptions}
            value={narratorFilter}
            onChange={setNarratorFilter}
            className="min-w-36"
          />
        </div>
      </div>

      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-content-400/15 bg-base-200 px-3 py-2">
          <span className="text-sm text-content-300">
            已选 <span className="font-medium text-content-100">{selected.size}</span> 项
          </span>
          <div className="h-5 w-px bg-content-400/15" />
          <Button variant="ghost" size="sm" onClick={handleClearSelection}>
            <XIcon />
            取消选择
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownloadSelected}
            disabled={downloadingBatch}
          >
            {downloadingBatch ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
            {downloadingBatch ? "打包中…" : "下载"}
          </Button>
          <Dropdown align="start" items={narratorMenuItems}>
            <Button variant="ghost" size="sm" disabled={setNarratorsMut.isPending}>
              <UsersIcon />
              设置角色
            </Button>
          </Dropdown>
        </div>
      )}

      {filteredSegments.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-content-400/20 bg-base-200 text-sm text-content-400">
          {segments.length === 0 ? "本章节还没有段落" : "没有匹配的段落"}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-content-400/20 bg-base-200">
          <div
            className={cn(
              "grid h-10 shrink-0 items-center border-b border-content-400/15 bg-base-300/50 px-4 text-xs font-medium text-content-300",
              COLUMN_TEMPLATE,
            )}
          >
            <div className="flex items-center">
              <Checkbox value={allFilteredSelected} onChange={toggleSelectAll} aria-label="全选" />
            </div>
            <div>编号</div>
            <div>角色</div>
            <div>文本</div>
            <div>状态</div>
            <div>操作</div>
          </div>
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                position: "relative",
                width: "100%",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((vrow) => {
                const segment = filteredSegments[vrow.index];
                if (!segment) return null;
                const status = deriveStatus(segment, liveStateOf(segment.id));
                const isSelected = selected.has(segment.id);
                const segmentIndexInChapter = indexById.get(segment.id) ?? 0;
                const playId = `seg-${segment.id}`;
                const isPlaying = player.playingId === playId;
                const isLoadingAudio = player.isLoading && isPlaying;
                return (
                  <SegmentRow
                    key={segment.id}
                    segment={segment}
                    status={status}
                    indexLabel={String(segmentIndexInChapter).padStart(indexPad, "0")}
                    narratorName={segment.narratorName}
                    isSelected={isSelected}
                    onToggleSelect={(v, shift) => toggleSelect(segment.id, v, shift)}
                    isPlaying={isPlaying}
                    isLoadingAudio={isLoadingAudio}
                    canPlay={segment.generationId != null}
                    isInQueue={status === "queued" || status === "generating"}
                    onTogglePlay={() => startPlay(segment)}
                    onEnqueue={() => handleSingleEnqueue(segment)}
                    onEdit={() => setEditingSegment(segment)}
                    onEditAudio={() => {
                      player.stop();
                      setAudioSegment(segment);
                    }}
                    onSwitchHistory={() => setHistorySegment(segment)}
                    onDownload={() => handleDownloadOne(segment)}
                    onMarkStale={() => markStaleMut.mutate(segment.id)}
                    onViewInfo={() => handleViewInfo(segment)}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${vrow.start}px)`,
                      height: `${vrow.size}px`,
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {audioSegment?.generationId && (
        <SegmentAudioDialog
          segmentId={audioSegment.id}
          generationId={audioSegment.generationId}
          onClose={() => setAudioSegment(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["segment-generations", audioSegment.id] });
            qc.invalidateQueries({ queryKey: ["segments", chapter.id] });
            qc.invalidateQueries({ queryKey: ["chapters", chapter.projectId] });
            setAudioSegment(null);
          }}
        />
      )}
      <SegmentEditDialog
        chapterId={chapter.id}
        projectId={chapter.projectId}
        segment={editingSegment}
        open={!!editingSegment}
        onOpenChange={(open) => {
          if (!open) setEditingSegment(null);
        }}
      />
      <SegmentHistoryDialog
        chapterId={chapter.id}
        segment={historySegment}
        open={!!historySegment}
        onOpenChange={(open) => {
          if (!open) setHistorySegment(null);
        }}
      />
      <GenerationInfoDialog
        info={generationInfo}
        open={!!generationInfo}
        onOpenChange={(open) => {
          if (!open) setGenerationInfo(null);
        }}
      />
    </div>
  );
}

function SegmentRow({
  segment,
  status,
  indexLabel,
  narratorName,
  isSelected,
  onToggleSelect,
  isPlaying,
  isLoadingAudio,
  canPlay,
  isInQueue,
  onTogglePlay,
  onEnqueue,
  onEdit,
  onEditAudio,
  onSwitchHistory,
  onDownload,
  onMarkStale,
  onViewInfo,
  style,
}: {
  segment: SegmentListItem;
  status: SegmentStatus;
  indexLabel: string;
  narratorName: string | null;
  isSelected: boolean;
  onToggleSelect: (next: boolean, shiftKey: boolean) => void;
  isPlaying: boolean;
  isLoadingAudio: boolean;
  canPlay: boolean;
  isInQueue: boolean;
  onTogglePlay: () => void;
  onEnqueue: () => void;
  onEdit: () => void;
  onEditAudio: () => void;
  onSwitchHistory: () => void;
  onDownload: () => void;
  onMarkStale: () => void;
  onViewInfo: () => void;
  style?: React.CSSProperties;
}) {
  const displayName = narratorName ?? "默认";
  const text = (segment.content ?? "").trim();
  const hasGeneration = segment.generationId != null;
  const regenIcon = hasGeneration ? <RefreshCwIcon /> : <ZapIcon />;
  const regenLabel = hasGeneration ? "重新生成" : "生成";
  const canSwitchHistory = segment.generationCount >= 2;

  // Captured during click on the underlying input so onChange can forward the
  // modifier state — Checkbox's onChange only surfaces the next boolean.
  const shiftKeyAtClickRef = useRef(false);

  return (
    <div
      className={cn(
        "grid items-center border-b border-content-400/15 px-4 text-sm text-content-200 transition-colors hover:bg-base-300/40",
        isSelected && "bg-base-300/60",
        COLUMN_TEMPLATE,
      )}
      style={style}
    >
      <div className="flex items-center">
        <Checkbox
          value={isSelected}
          onClick={(e) => {
            shiftKeyAtClickRef.current = e.shiftKey;
          }}
          onChange={(next) => onToggleSelect(next, shiftKeyAtClickRef.current)}
          aria-label={`选择段落 ${indexLabel}`}
        />
      </div>
      <div className="font-mono text-xs text-content-300">{indexLabel}</div>
      <span
        className="truncate text-xs text-content-400"
        style={narratorName ? { color: narratorColor(narratorName) } : undefined}
      >
        {displayName}
      </span>
      <div className="flex min-w-0 items-center gap-1.5">
        {segment.leadingSilence !== null && (
          <Tooltip content={`前置留白 ${formatDuration(segment.leadingSilence)}`}>
            <ClockIcon className="size-3.5 shrink-0 text-info" />
          </Tooltip>
        )}
        <span
          className={cn("min-w-0 truncate", isPlaying && "animate-pulse text-primary-500")}
          title={text}
        >
          {text || <span className="text-content-400">（空）</span>}
        </span>
        {segment.trailingSilence !== null && (
          <Tooltip content={`后置留白 ${formatDuration(segment.trailingSilence)}`}>
            <ClockIcon className="size-3.5 shrink-0 text-info" />
          </Tooltip>
        )}
      </div>
      <div>
        <Badge variant={STATUS_VARIANT[status]} size="sm" rounded>
          {STATUS_LABEL[status]}
        </Badge>
      </div>
      <div className="inline-flex items-center gap-1">
        <Button
          variant={isPlaying ? "primary" : "ghost"}
          size="sm"
          shape="circle"
          onClick={onTogglePlay}
          disabled={!canPlay || isLoadingAudio}
          aria-label={isPlaying ? "停止" : "播放"}
          className={cn(isPlaying && "animate-pulse")}
        >
          {isLoadingAudio ? (
            <Loader2Icon className="animate-spin" />
          ) : isPlaying ? (
            <SquareIcon />
          ) : (
            <PlayIcon />
          )}
        </Button>
        <Tooltip content={regenLabel}>
          <Button
            variant="ghost"
            size="sm"
            shape="circle"
            onClick={onEnqueue}
            disabled={isInQueue}
            aria-label={regenLabel}
          >
            {regenIcon}
          </Button>
        </Tooltip>
        <Tooltip content="切换历史">
          <Button
            variant="ghost"
            size="sm"
            shape="circle"
            onClick={onSwitchHistory}
            disabled={!canSwitchHistory}
            aria-label="切换"
          >
            <HistoryIcon />
          </Button>
        </Tooltip>
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
              key: "edit-audio",
              label: "编辑音频",
              icon: <AudioLinesIcon />,
              disabled: !hasGeneration,
              onSelect: onEditAudio,
            },
            {
              key: "download",
              label: "下载",
              icon: <DownloadIcon />,
              disabled: !hasGeneration,
              onSelect: onDownload,
            },
            {
              key: "mark",
              label: "标记过期",
              icon: <FlagIcon />,
              disabled: !hasGeneration || segment.isStale,
              onSelect: onMarkStale,
            },
            { type: "separator" },
            {
              key: "info",
              label: "查看信息",
              icon: <InfoIcon />,
              disabled: !hasGeneration,
              onSelect: onViewInfo,
            },
          ]}
        >
          <Button variant="ghost" size="sm" shape="circle" aria-label="更多操作">
            <MoreHorizontalIcon />
          </Button>
        </Dropdown>
      </div>
    </div>
  );
}

function GenerationInfoDialog({
  info,
  open,
  onOpenChange,
}: {
  info: SegmentGenerationInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="生成信息"
      size="md"
      footer={
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          关闭
        </Button>
      }
    >
      {info && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-content-300">Service URL</span>
            <span className="text-sm break-all text-content-100">{info.serviceUrl ?? "—"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-content-300">Payload</span>
            <pre className="overflow-x-auto rounded-md bg-base-200 p-3 font-mono text-xs text-content-100">
              {info.payload ? JSON.stringify(info.payload, null, 2) : "—"}
            </pre>
          </div>
        </div>
      )}
    </Dialog>
  );
}
