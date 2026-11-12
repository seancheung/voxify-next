import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownUpIcon, Loader2Icon, PlayIcon, SearchIcon, SquareIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import Input from "@/components/ui/input";
import Radio, { RadioGroup } from "@/components/ui/radio";
import Select, { type SelectOption } from "@/components/ui/select";
import Skeleton from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Tooltip from "@/components/ui/tooltip";
import { useDebouncedState } from "@/hooks/use-debounced";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { usePreviewPlayer } from "@/hooks/use-preview-player";
import { t } from "@/i18n";
import { listTTSServices } from "@/lib/tts-services.functions";
import { type ListVoicesResult, listVoices, type VoiceListItem } from "@/lib/voices.functions";
import { cn } from "@/utils/cn";

const PAGE_SIZE = 24;
const ALL_SERVICES = 0;
type SortKey = "createdAt" | "name";

const SORT_OPTIONS: SelectOption<SortKey>[] = [
  {
    value: "createdAt",
    get label() {
      return t("Added at");
    },
  },
  {
    value: "name",
    get label() {
      return t("Name");
    },
  },
];

export type VoicePickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: number | null;
  onChange: (value: number | null, voice: VoiceListItem | null) => void;
  title?: string;
  description?: string;
};

export default function VoicePickerDialog({
  open,
  onOpenChange,
  value,
  onChange,
  title = t("Choose voice"),
  description = t("Only enabled voices are shown"),
}: VoicePickerDialogProps) {
  const list = useServerFn(listVoices);
  const fetchServices = useServerFn(listTTSServices);

  const [sort, setSort] = useState<SortKey>("createdAt");
  const [ttsServiceId, setTtsServiceId] = useState<number>(ALL_SERVICES);
  const [query, debouncedQueryRaw, setQuery] = useDebouncedState("", 250);
  const [pendingId, setPendingId] = useState<number | null>(value);

  const debouncedQuery = debouncedQueryRaw.trim();

  useEffect(() => {
    if (open) {
      setPendingId(value);
      setQuery("");
      setSort("createdAt");
      setTtsServiceId(ALL_SERVICES);
    }
  }, [open, value, setQuery]);

  const { data: services = [] } = useQuery({
    queryKey: ["tts-services"],
    queryFn: () => fetchServices(),
    enabled: open,
  });

  const serviceOptions: SelectOption<number>[] = [
    { value: ALL_SERVICES, label: t("All services") },
    ...services.map((s) => ({ value: s.id, label: s.name })),
  ];

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isFetching } =
    useInfiniteQuery({
      queryKey: ["voice-picker", { sort, ttsServiceId, search: debouncedQuery }] as const,
      queryFn: ({ pageParam }) =>
        list({
          data: {
            cursor: pageParam,
            sort,
            enabled: "enabled",
            search: debouncedQuery || undefined,
            ttsServiceId: ttsServiceId || undefined,
            limit: PAGE_SIZE,
          },
        }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last: ListVoicesResult) => last.nextCursor ?? undefined,
      enabled: open,
    });

  const voices = data?.pages.flatMap((p) => p.items) ?? [];
  const isFiltered = !!debouncedQuery || ttsServiceId !== ALL_SERVICES || sort !== "createdAt";
  const showSkeleton = useDelayedFlag(isLoading);

  const scrollRef = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll-to-top should fire when filter inputs change
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTo({ top: 0 });
  }, [sort, ttsServiceId, debouncedQuery]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !open) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root: scrollRef.current, rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, open]);

  const player = usePreviewPlayer();
  const stopRef = useRef(player.stop);
  stopRef.current = player.stop;
  useEffect(() => {
    if (!open) stopRef.current();
  }, [open]);

  const selectedVoice = voices.find((v) => v.id === pendingId) ?? null;

  function handleConfirm() {
    onChange(pendingId, selectedVoice);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("Cancel")}
          </Button>
          <Button disabled={!pendingId} onClick={handleConfirm}>
            {t("Confirm")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select<number>
            options={serviceOptions}
            value={ttsServiceId}
            onChange={setTtsServiceId}
            className="min-w-40"
          />
          <Input
            type="search"
            placeholder={t("Search names or tags…")}
            value={query}
            onChange={setQuery}
            icon={<SearchIcon />}
            className="w-50 transition-all focus-within:w-72"
          />
          <Select<SortKey>
            icon={<ArrowDownUpIcon />}
            options={SORT_OPTIONS}
            value={sort}
            onChange={setSort}
            className="ml-auto min-w-40"
          />
        </div>
        <div ref={scrollRef} className="max-h-[60vh] min-h-80 overflow-y-auto">
          {showSkeleton ? (
            <VoiceTableSkeleton />
          ) : voices.length === 0 ? (
            <div className="flex h-72 items-center justify-center text-sm text-content-400">
              {isFiltered ? t("No matching voices") : t("No voices available")}
            </div>
          ) : (
            <RadioGroup<number | null>
              name="voice-picker"
              value={pendingId}
              onChange={(v) => setPendingId(v ?? null)}
            >
              <Table className="[&_td]:px-3 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-3">
                <TableHeader className="sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="w-8" aria-label={t("Select")} />
                    <TableHead>{t("Name")}</TableHead>
                    <TableHead>{t("Service")}</TableHead>
                    <TableHead>{t("Tags")}</TableHead>
                    <TableHead className="w-10 text-right">{t("Preview")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {voices.map((v) => (
                    <VoiceRow
                      key={v.id}
                      voice={v}
                      selected={pendingId === v.id}
                      isPlaying={player.playingId === String(v.id)}
                      isLoadingAudio={player.isLoading && player.playingId === String(v.id)}
                      onSelect={() => setPendingId(v.id)}
                      onTogglePlay={() => {
                        if (v.previewUrl) player.toggle(String(v.id), v.previewUrl);
                      }}
                    />
                  ))}
                </TableBody>
              </Table>
            </RadioGroup>
          )}
          <div ref={sentinelRef} className="h-px" aria-hidden="true" />
          {isFetchingNextPage && (
            <div className="py-4 text-center text-xs text-content-400">{t("Loading…")}</div>
          )}
          {!hasNextPage && !isFetching && !showSkeleton && voices.length >= PAGE_SIZE && (
            <div className="py-4 text-center text-xs text-content-400">{t("End of list")}</div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function VoiceRow({
  voice,
  selected,
  isPlaying,
  isLoadingAudio,
  onSelect,
  onTogglePlay,
}: {
  voice: VoiceListItem;
  selected: boolean;
  isPlaying: boolean;
  isLoadingAudio: boolean;
  onSelect: () => void;
  onTogglePlay: () => void;
}) {
  const tags = metadataTags(voice.metadata);
  return (
    <TableRow
      onClick={onSelect}
      aria-selected={selected}
      className={cn("cursor-pointer", selected && "bg-primary-500/10 hover:bg-primary-500/15")}
    >
      <TableCell className="w-8">
        <Radio value={voice.id} aria-label={voice.name} />
      </TableCell>
      <TableCell>
        <Tooltip content={<span className="font-mono">{voice.key}</span>}>
          <span className="block truncate text-sm text-content-200">{voice.name}</span>
        </Tooltip>
      </TableCell>
      <TableCell className="text-xs text-content-300">{voice.ttsServiceName}</TableCell>
      <TableCell>
        {tags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {tags.slice(0, 3).map((tag) => (
              <Badge key={tag} size="sm" variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-xs text-content-400">—</span>
        )}
      </TableCell>
      <TableCell className="w-10 text-right">
        <button
          type="button"
          aria-label={isPlaying ? t("Stop") : t("Preview")}
          disabled={!voice.previewUrl || isLoadingAudio}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePlay();
          }}
          onKeyDown={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-content-300 transition-colors not-disabled:hover:bg-base-400 not-disabled:hover:text-content-100 disabled:cursor-not-allowed disabled:opacity-40",
            "has-icon-3.5",
          )}
        >
          {isLoadingAudio ? (
            <Loader2Icon className="animate-spin" />
          ) : isPlaying ? (
            <SquareIcon />
          ) : (
            <PlayIcon />
          )}
        </button>
      </TableCell>
    </TableRow>
  );
}

function VoiceTableSkeleton() {
  return (
    <Table className="[&_td]:px-3 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-3">
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" aria-label={t("Select")} />
          <TableHead>{t("Name")}</TableHead>
          <TableHead>{t("Service")}</TableHead>
          <TableHead>{t("Tags")}</TableHead>
          <TableHead className="w-10 text-right">{t("Preview")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 6 }, (_, i) => (
          <TableRow key={i}>
            <TableCell className="w-8">
              <Skeleton className="size-3.5 rounded-full" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-32" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-3 w-16" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-20 rounded-sm" />
            </TableCell>
            <TableCell className="w-10 text-right">
              <Skeleton className="ml-auto size-6 rounded-full" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function metadataTags(metadata: VoiceListItem["metadata"]): string[] {
  if (!metadata) return [];
  const tags: string[] = [];
  if (metadata.gender) tags.push(String(metadata.gender));
  if (metadata.age) tags.push(String(metadata.age));
  if (metadata.language) tags.push(String(metadata.language));
  if (Array.isArray(metadata.tags)) tags.push(...metadata.tags.map(String));
  return tags;
}
