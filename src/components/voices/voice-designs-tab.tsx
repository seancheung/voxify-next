import {
  infiniteQueryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SparklesIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import { Table, TableBody, TableHeader } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import VoiceDesignDialog, {
  type VoiceDesignDialogPrefill,
} from "@/components/voices/voice-design-dialog";
import VoiceDesignRenameDialog from "@/components/voices/voice-design-rename-dialog";
import VoiceDesignRow from "@/components/voices/voice-design-row";
import VoiceDesignSkeletonRow from "@/components/voices/voice-design-skeleton-row";
import VoiceDesignsEmptyState from "@/components/voices/voice-designs-empty-state";
import VoiceDesignsHeaderRow from "@/components/voices/voice-designs-header-row";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { usePreviewPlayer } from "@/hooks/use-preview-player";
import {
  deleteVoiceDesign,
  getVoiceDesignDownloadInfo,
  getVoiceDesignPreviewUrl,
  hasRunningVoiceDesigns,
  type ListVoiceDesignsResult,
  listVoiceDesigns,
  type VoiceDesignListItem,
} from "@/lib/voice-designs.functions";

const PAGE_SIZE = 24;
const POLL_INTERVAL_MS = 3000;

function designsQueryOptions() {
  return infiniteQueryOptions({
    queryKey: ["voice-designs"] as const,
    queryFn: ({ pageParam }) =>
      listVoiceDesigns({
        data: { cursor: pageParam, limit: PAGE_SIZE },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: ListVoiceDesignsResult) => last.nextCursor ?? undefined,
  });
}

export default function VoiceDesignsTab() {
  const qc = useQueryClient();
  const list = useServerFn(listVoiceDesigns);
  const remove = useServerFn(deleteVoiceDesign);
  const previewFn = useServerFn(getVoiceDesignPreviewUrl);
  const downloadFn = useServerFn(getVoiceDesignDownloadInfo);
  const runningFn = useServerFn(hasRunningVoiceDesigns);

  const [creating, setCreating] = useState(false);
  const [prefill, setPrefill] = useState<VoiceDesignDialogPrefill | null>(null);
  const [renaming, setRenaming] = useState<VoiceDesignListItem | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<VoiceDesignListItem | null>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    ...designsQueryOptions(),
    queryFn: ({ pageParam }) => list({ data: { cursor: pageParam, limit: PAGE_SIZE } }),
  });

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const showSkeleton = useDelayedFlag(isLoading);

  // Poll the lightweight "any pending/running?" endpoint while jobs are in
  // flight and invalidate the list when they all settle. Avoids hammering
  // the full paginated list on every interval.
  const hasInFlight = items.some((it) => it.status === "pending" || it.status === "running");
  const { data: runningInfo } = useQuery({
    queryKey: ["voice-designs", "running"],
    queryFn: () => runningFn({ data: {} }),
    enabled: hasInFlight,
    refetchInterval: hasInFlight ? POLL_INTERVAL_MS : false,
    refetchOnWindowFocus: false,
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh whenever the polled count changes (in particular when it drops to 0)
  useEffect(() => {
    if (!hasInFlight) return;
    qc.invalidateQueries({ queryKey: ["voice-designs"] });
  }, [runningInfo?.count]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const player = usePreviewPlayer();

  const deleteMut = useMutation({
    mutationFn: (id: number) => remove({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voice-designs"] });
      setConfirmingDelete(null);
      toast.success("已删除");
    },
    onError: (err) =>
      toast.error({
        title: "删除失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  async function handleDownload(design: VoiceDesignListItem) {
    try {
      const { url, audioFileName } = await downloadFn({
        data: { id: design.id },
      });
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`下载音频失败 (${resp.status})`);
      const { downloadZip } = await import("client-zip");
      const blob = await downloadZip([
        { name: audioFileName, input: resp },
        { name: `${design.name}.txt`, input: design.input },
      ]).blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${design.name}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (err) {
      toast.error({
        title: "下载失败",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function handleRegenerate(design: VoiceDesignListItem) {
    setPrefill({
      ttsServiceId: design.ttsServiceId ?? 0,
      name: design.name,
      instruct: design.instruct,
      input: design.input,
    });
    setCreating(true);
  }

  function openCreate() {
    setPrefill(null);
    setCreating(true);
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-end">
        <Button onClick={openCreate}>
          <SparklesIcon />
          设计声音
        </Button>
      </div>
      {showSkeleton ? (
        <Table>
          <TableHeader>
            <VoiceDesignsHeaderRow />
          </TableHeader>
          <TableBody>
            {Array.from({ length: 6 }, (_, i) => (
              <VoiceDesignSkeletonRow key={i} />
            ))}
          </TableBody>
        </Table>
      ) : isLoading ? null : items.length === 0 ? (
        <VoiceDesignsEmptyState />
      ) : (
        <>
          <Table>
            <TableHeader>
              <VoiceDesignsHeaderRow />
            </TableHeader>
            <TableBody>
              {items.map((it) => (
                <VoiceDesignRow
                  key={it.id}
                  design={it}
                  isPlaying={player.playingId === String(it.id)}
                  isLoadingAudio={player.isLoading && player.playingId === String(it.id)}
                  onTogglePlay={() => {
                    if (it.status !== "ready" || it.fileId == null) return;
                    player.toggle(String(it.id), async () => {
                      const { url } = await previewFn({ data: { id: it.id } });
                      return url;
                    });
                  }}
                  onDownload={() => handleDownload(it)}
                  onRename={() => setRenaming(it)}
                  onRegenerate={() => handleRegenerate(it)}
                  onDelete={() => setConfirmingDelete(it)}
                />
              ))}
            </TableBody>
          </Table>
          <div ref={sentinelRef} className="h-px" aria-hidden="true" />
          {isFetchingNextPage && (
            <div className="py-6 text-center text-xs text-content-400">加载中…</div>
          )}
          {!hasNextPage && items.length >= PAGE_SIZE && (
            <div className="py-6 text-center text-xs text-content-400">已经到底了</div>
          )}
        </>
      )}

      <VoiceDesignDialog
        open={creating}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setPrefill(null);
          }
        }}
        prefill={prefill}
      />

      <VoiceDesignRenameDialog
        open={!!renaming}
        onOpenChange={(open) => {
          if (!open) setRenaming(null);
        }}
        design={renaming}
      />

      <Dialog
        open={!!confirmingDelete}
        onOpenChange={(open) => {
          if (!open && !deleteMut.isPending) setConfirmingDelete(null);
        }}
        title="确认删除"
        description={
          confirmingDelete ? `“${confirmingDelete.name}” 将被删除，操作不可撤销。` : undefined
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
    </>
  );
}
