import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2Icon, PlayIcon, SquareIcon } from "lucide-react";
import { useEffect, useState } from "react";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import Radio, { RadioGroup } from "@/components/ui/radio";
import { toast } from "@/components/ui/toast";
import { usePreviewPlayer } from "@/hooks/use-preview-player";
import { t } from "@/i18n";
import {
  getSegmentGenerationUrl,
  listSegmentGenerations,
  type SegmentListItem,
  setSegmentGeneration,
} from "@/lib/segments.functions";
import { cn } from "@/utils/cn";
import { relativeTime } from "@/utils/datetime";

export default function SegmentHistoryDialog({
  segment,
  chapterId,
  open,
  onOpenChange,
}: {
  segment: SegmentListItem | null;
  chapterId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const fetchHistory = useServerFn(listSegmentGenerations);
  const setActive = useServerFn(setSegmentGeneration);
  const fetchUrl = useServerFn(getSegmentGenerationUrl);
  const player = usePreviewPlayer();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["segment-generations", segment?.id],
    queryFn: () => fetchHistory({ data: { segmentId: segment?.id ?? 0 } }),
    enabled: open && !!segment,
  });

  const setActiveMut = useMutation({
    mutationFn: (input: { segmentId: number; generationId: number }) => setActive({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["segments", chapterId] });
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error({
        title: t("Switch failed"),
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Reset selection to the current generation each time the dialog opens
  // (or the target segment changes).
  useEffect(() => {
    if (open) setSelectedId(segment?.generationId ?? null);
  }, [open, segment]);

  const submitting = setActiveMut.isPending;
  const canConfirm =
    !!segment && selectedId != null && selectedId !== segment.generationId && !submitting;

  function handleConfirm() {
    if (!segment || selectedId == null) return;
    setActiveMut.mutate({ segmentId: segment.id, generationId: selectedId });
  }

  function handleClose() {
    player.stop();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) player.stop();
        onOpenChange(next);
      }}
      title={t("Switch audio version")}
      description={t("Choose a previous generation for this segment")}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>
            {t("Cancel")}
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            {submitting ? t("Switching…") : t("Confirm")}
          </Button>
        </>
      }
    >
      {isLoading ? (
        <div className="flex h-40 items-center justify-center text-content-400">
          <Loader2Icon className="size-5 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-content-400">
          {t("No previous audio versions")}
        </div>
      ) : (
        <RadioGroup<number>
          value={selectedId ?? undefined}
          onChange={setSelectedId}
          disabled={submitting}
          className="max-h-96 overflow-y-auto"
        >
          {rows.map((row) => {
            const id = String(row.id);
            const isPlaying = player.playingId === id;
            const isLoadingAudio = player.isLoading && isPlaying;
            const isActive = segment?.generationId === row.id;
            return (
              <div
                key={row.id}
                className={cn(
                  "flex items-center gap-3 rounded-md border border-content-400/20 bg-base-200 px-3 py-2",
                  isActive && "border-primary-500/60 bg-primary-500/5",
                )}
              >
                <Radio value={row.id} />
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm text-content-100">
                        {row.voiceKey ?? "—"}
                      </span>
                      {row.editedFromGenerationId != null && (
                        <Badge size="sm" variant="info">
                          {t("Edited version")}
                        </Badge>
                      )}
                    </div>
                    {row.text && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-content-300">{row.text}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-content-400">
                    {relativeTime(row.createdAt)}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  shape="square"
                  onClick={() =>
                    player.toggle(id, async () => {
                      const r = await fetchUrl({ data: { id: row.id } });
                      return r.url;
                    })
                  }
                  aria-label={isPlaying ? t("Stop") : t("Preview")}
                  disabled={isLoadingAudio}
                >
                  {isLoadingAudio ? (
                    <Loader2Icon className="animate-spin" />
                  ) : isPlaying ? (
                    <SquareIcon />
                  ) : (
                    <PlayIcon />
                  )}
                </Button>
              </div>
            );
          })}
        </RadioGroup>
      )}
    </Dialog>
  );
}
