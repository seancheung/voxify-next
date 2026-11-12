import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  MoreHorizontalIcon,
  PencilIcon,
  PlugIcon,
  PlusIcon,
  RefreshCcwIcon,
  TrashIcon,
} from "lucide-react";
import { useState } from "react";
import TTSServiceDialog from "@/components/settings/tts-service-dialog";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import Dropdown from "@/components/ui/dropdown";
import Skeleton from "@/components/ui/skeleton";
import Switch from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { t } from "@/i18n";
import {
  deleteTTSService,
  listTTSServices,
  syncTTSVoices,
  type TTSServiceListItem,
  testTTSService,
  toggleTTSService,
} from "@/lib/tts-services.functions";
import { TTSServiceType } from "@/types/tts";
import { cn } from "@/utils/cn";
import Badge from "../ui/badge";

const TYPE_LABELS: Record<TTSServiceType, string> = {
  [TTSServiceType.OpenTTS]: "Open TTS",
  get [TTSServiceType.OpenAITTS]() {
    return t("OpenAI TTS compatible");
  },
};

export default function TTSServicesSection() {
  const fetchList = useServerFn(listTTSServices);
  const toggleFn = useServerFn(toggleTTSService);
  const deleteFn = useServerFn(deleteTTSService);
  const testFn = useServerFn(testTTSService);
  const syncFn = useServerFn(syncTTSVoices);
  const qc = useQueryClient();

  const [editing, setEditing] = useState<TTSServiceListItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<TTSServiceListItem | null>(null);
  const [busyId, setBusyId] = useState<{
    id: number;
    kind: "test" | "sync";
  } | null>(null);

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["tts-services"],
    queryFn: () => fetchList(),
  });
  const showSkeleton = useDelayedFlag(isLoading);

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      toggleFn({ data: { id, enabled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tts-services"] }),
    onError: (err) =>
      toast.error({
        title: t("Update failed"),
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tts-services"] });
      qc.invalidateQueries({ queryKey: ["voices"] });
      setConfirmingDelete(null);
      toast.success(t("TTS service deleted"));
    },
    onError: (err) =>
      toast.error({
        title: t("Deletion failed"),
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const testMut = useMutation({
    mutationFn: (id: number) => testFn({ data: { id } }),
    onMutate: (id: number) => setBusyId({ id, kind: "test" }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["tts-services"] });
      toast.success({
        title: t("Connection successful"),
        description: t("Status {0}, latency {1} ms", res.status, res.latencyMs),
      });
    },
    onError: (err) =>
      toast.error({
        title: t("Connection failed"),
        description: err instanceof Error ? err.message : String(err),
      }),
    onSettled: () => setBusyId(null),
  });

  const syncMut = useMutation({
    mutationFn: (id: number) => syncFn({ data: { id } }),
    onMutate: (id: number) => setBusyId({ id, kind: "sync" }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["voices"] });
      toast.success({
        title: t("Voice library synced"),
        description: t(
          "{0} total, {1} added, {2} updated, {3} removed",
          res.total,
          res.added,
          res.updated,
          res.removed,
        ),
      });
    },
    onError: (err) =>
      toast.error({
        title: t("Sync failed"),
        description: err instanceof Error ? err.message : String(err),
      }),
    onSettled: () => setBusyId(null),
  });

  return (
    <section className="rounded-lg border border-content-400/20 bg-base-200 p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl text-content-100">{t("TTS services")}</h2>
          <p className="mt-1 text-sm text-content-300">
            {t(
              "Connect text-to-speech services. Open TTS supports voice sync and connection tests.",
            )}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon />
          {t("Add service")}
        </Button>
      </header>

      {showSkeleton ? (
        <ul className="flex flex-col gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <ServiceSkeleton key={i} />
          ))}
        </ul>
      ) : isLoading ? null : services.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-content-400/15 py-12 text-content-400">
          <p className="text-sm">{t("Add a TTS service to get started")}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {services.map((svc) => {
            const isOpenTTS = svc.type === TTSServiceType.OpenTTS;
            const testing = busyId?.id === svc.id && busyId.kind === "test";
            const syncing = busyId?.id === svc.id && busyId.kind === "sync";
            return (
              <li
                key={svc.id}
                className={cn(
                  "flex items-center gap-3 rounded-md border border-content-400/15 bg-base-300 px-4 py-3",
                  !svc.enabled && "opacity-60",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-base text-content-100">{svc.name}</h3>
                    <Badge variant="secondary" className="shrink-0">
                      {TYPE_LABELS[svc.type]}
                    </Badge>
                  </div>
                  <p
                    className="mt-0.5 truncate font-mono text-xs text-content-300"
                    title={svc.baseUrl}
                  >
                    {svc.baseUrl}
                  </p>
                  {isOpenTTS && svc.capabilities && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {capabilityTags(svc.capabilities).map((tag) => (
                        <Badge key={tag} size="sm">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isOpenTTS && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => testMut.mutate(svc.id)}
                        disabled={testing || !svc.enabled}
                      >
                        <PlugIcon />
                        {testing ? t("Testing…") : t("Test")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => syncMut.mutate(svc.id)}
                        disabled={syncing || !svc.enabled}
                      >
                        <RefreshCcwIcon className={cn(syncing && "animate-spin")} />
                        {syncing ? t("Syncing…") : t("Sync voices")}
                      </Button>
                    </>
                  )}
                  <Switch
                    value={svc.enabled ?? false}
                    onChange={(enabled) => toggleMut.mutate({ id: svc.id, enabled })}
                    size="sm"
                    aria-label={svc.enabled ? t("Disable") : t("Enable")}
                  />
                  <Dropdown
                    align="end"
                    items={[
                      {
                        key: "edit",
                        label: t("Edit"),
                        icon: <PencilIcon />,
                        onSelect: () => setEditing(svc),
                      },
                      { type: "separator" },
                      {
                        key: "delete",
                        label: t("Delete"),
                        icon: <TrashIcon />,
                        danger: true,
                        onSelect: () => setConfirmingDelete(svc),
                      },
                    ]}
                  >
                    <Button variant="ghost" size="sm" shape="circle" aria-label={t("More actions")}>
                      <MoreHorizontalIcon />
                    </Button>
                  </Dropdown>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <TTSServiceDialog
        open={creating || !!editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        service={editing}
      />

      <Dialog
        open={!!confirmingDelete}
        onOpenChange={(open) => {
          if (!open && !deleteMut.isPending) setConfirmingDelete(null);
        }}
        title={t("Delete TTS service?")}
        description={
          confirmingDelete
            ? t(
                "“{0}” and its associated voices will be permanently removed.",
                confirmingDelete.name,
              )
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
    </section>
  );
}

function capabilityTags(c: NonNullable<TTSServiceListItem["capabilities"]>): string[] {
  const tags: string[] = [];
  if (c.clone) tags.push("clone");
  if (c.design) tags.push("design");
  if (c.streaming) tags.push("streaming");
  if (c.builtin_voices) tags.push("builtin voices");
  if (c.languages) tags.push("languages");
  return tags;
}

function ServiceSkeleton() {
  return (
    <li className="flex items-center gap-3 rounded-md border border-content-400/15 bg-base-300 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20 rounded-sm" />
        </div>
        <Skeleton className="h-3 w-3/4" />
        <div className="flex flex-wrap gap-1 pt-0.5">
          <Skeleton className="h-4 w-12 rounded-sm" />
          <Skeleton className="h-4 w-14 rounded-sm" />
          <Skeleton className="h-4 w-16 rounded-sm" />
        </div>
      </div>
      <Skeleton className="h-6 w-14 shrink-0 rounded-md" />
      <Skeleton className="h-6 w-20 shrink-0 rounded-md" />
      <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
      <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
    </li>
  );
}
