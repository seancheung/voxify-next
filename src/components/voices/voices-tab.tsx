import {
  infiniteQueryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import type { SelectOption } from "@/components/ui/select";
import { Table, TableBody, TableHeader } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import VoiceDialog from "@/components/voices/voice-dialog";
import VoiceRow from "@/components/voices/voice-row";
import VoiceSkeletonRow from "@/components/voices/voice-skeleton-row";
import VoicesEmptyState from "@/components/voices/voices-empty-state";
import VoicesHeaderRow from "@/components/voices/voices-header-row";
import VoicesToolbar, {
  type VoicesEnabledFilter,
  type VoicesSortKey,
} from "@/components/voices/voices-toolbar";
import { useDebouncedState } from "@/hooks/use-debounced";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { usePreviewPlayer } from "@/hooks/use-preview-player";
import { t } from "@/i18n";
import { listTTSServices } from "@/lib/tts-services.functions";
import {
  deleteVoice,
  type ListVoicesResult,
  listVoices,
  toggleVoice,
  type VoiceListItem,
} from "@/lib/voices.functions";

const PAGE_SIZE = 24;
export const VOICES_DEFAULT_SORT: VoicesSortKey = "createdAt";
export const VOICES_DEFAULT_ENABLED: VoicesEnabledFilter = "all";
export const VOICES_ALL_SERVICES = 0 as const;

export function voicesQueryOptions(params: {
  sort: VoicesSortKey;
  enabled: VoicesEnabledFilter;
  search: string;
  ttsServiceId: number;
}) {
  const { sort, enabled, search, ttsServiceId } = params;
  return infiniteQueryOptions({
    queryKey: ["voices", { sort, enabled, search, ttsServiceId }] as const,
    queryFn: ({ pageParam }) =>
      listVoices({
        data: {
          cursor: pageParam,
          sort,
          enabled,
          search: search || undefined,
          ttsServiceId: ttsServiceId || undefined,
          limit: PAGE_SIZE,
        },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: ListVoicesResult) => last.nextCursor ?? undefined,
  });
}

export default function VoicesTab() {
  const list = useServerFn(listVoices);
  const fetchServices = useServerFn(listTTSServices);
  const toggleFn = useServerFn(toggleVoice);
  const deleteFn = useServerFn(deleteVoice);
  const qc = useQueryClient();

  const [sort, setSort] = useState<VoicesSortKey>(VOICES_DEFAULT_SORT);
  const [enabled, setEnabled] = useState<VoicesEnabledFilter>(VOICES_DEFAULT_ENABLED);
  const [ttsServiceId, setTtsServiceId] = useState<number>(VOICES_ALL_SERVICES);
  const [query, debouncedQueryRaw, setQuery] = useDebouncedState("", 250);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<VoiceListItem | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<VoiceListItem | null>(null);

  const debouncedQuery = debouncedQueryRaw.trim();

  const { data: services = [] } = useQuery({
    queryKey: ["tts-services"],
    queryFn: () => fetchServices(),
  });

  const serviceOptions: SelectOption<number>[] = [
    { value: VOICES_ALL_SERVICES, label: t("All services") },
    ...services.map((s) => ({ value: s.id, label: s.name })),
  ];

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    ...voicesQueryOptions({
      sort,
      enabled,
      search: debouncedQuery,
      ttsServiceId,
    }),
    queryFn: ({ pageParam }) =>
      list({
        data: {
          cursor: pageParam,
          sort,
          enabled,
          search: debouncedQuery || undefined,
          ttsServiceId: ttsServiceId || undefined,
          limit: PAGE_SIZE,
        },
      }),
  });

  const voices = data?.pages.flatMap((p) => p.items) ?? [];
  const loadedCount = voices.length;
  const isFiltered = !!debouncedQuery || enabled !== "all" || ttsServiceId !== VOICES_ALL_SERVICES;
  const showSkeleton = useDelayedFlag(isLoading);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll-to-top should fire when filter inputs change
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [sort, enabled, ttsServiceId, debouncedQuery]);

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

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled: next }: { id: number; enabled: boolean }) =>
      toggleFn({ data: { id, enabled: next } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["voices"] }),
    onError: (err) =>
      toast.error({
        title: t("Update failed"),
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voices"] });
      setConfirmingDelete(null);
      toast.success(t("Voice deleted"));
    },
    onError: (err) =>
      toast.error({
        title: t("Deletion failed"),
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  return (
    <>
      <VoicesToolbar
        query={query}
        onQueryChange={setQuery}
        ttsServiceId={ttsServiceId}
        onTtsServiceIdChange={setTtsServiceId}
        serviceOptions={serviceOptions}
        enabled={enabled}
        onEnabledChange={setEnabled}
        sort={sort}
        onSortChange={setSort}
      />
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-content-300">
          {hasNextPage
            ? t("Loaded {0} voices. Scroll for more.", loadedCount)
            : t("{0} voices", loadedCount)}
        </p>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon />
          {t("New voice")}
        </Button>
      </div>
      {showSkeleton ? (
        <Table>
          <TableHeader>
            <VoicesHeaderRow />
          </TableHeader>
          <TableBody>
            {Array.from({ length: 6 }, (_, i) => (
              <VoiceSkeletonRow key={i} />
            ))}
          </TableBody>
        </Table>
      ) : isLoading ? null : voices.length === 0 ? (
        <VoicesEmptyState hasFilters={isFiltered} onCreate={() => setCreating(true)} />
      ) : (
        <>
          <Table>
            <TableHeader>
              <VoicesHeaderRow />
            </TableHeader>
            <TableBody>
              {voices.map((v) => (
                <VoiceRow
                  key={v.id}
                  voice={v}
                  isPlaying={player.playingId === String(v.id)}
                  isLoadingAudio={player.isLoading && player.playingId === String(v.id)}
                  onTogglePlay={() => {
                    if (v.previewUrl) player.toggle(String(v.id), v.previewUrl);
                  }}
                  onToggleEnabled={(next) => toggleMut.mutate({ id: v.id, enabled: next })}
                  onEdit={() => setEditing(v)}
                  onDelete={() => setConfirmingDelete(v)}
                />
              ))}
            </TableBody>
          </Table>
          <div ref={sentinelRef} className="h-px" aria-hidden="true" />
          {isFetchingNextPage && (
            <div className="py-6 text-center text-xs text-content-400">{t("Loading…")}</div>
          )}
          {!hasNextPage && voices.length >= PAGE_SIZE && (
            <div className="py-6 text-center text-xs text-content-400">{t("End of list")}</div>
          )}
        </>
      )}
      <VoiceDialog
        open={creating || !!editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        voice={editing}
      />

      <Dialog
        open={!!confirmingDelete}
        onOpenChange={(open) => {
          if (!open && !deleteMut.isPending) setConfirmingDelete(null);
        }}
        title={t("Delete voice?")}
        description={
          confirmingDelete
            ? t("“{0}” will be permanently removed.", confirmingDelete.name)
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
              {t("Cancel")}
            </Button>
            <Button
              variant="danger"
              disabled={deleteMut.isPending}
              onClick={() => {
                if (confirmingDelete) deleteMut.mutate(confirmingDelete.id);
              }}
            >
              {deleteMut.isPending ? t("Deleting…") : t("Confirm deletion")}
            </Button>
          </>
        }
      />
    </>
  );
}
