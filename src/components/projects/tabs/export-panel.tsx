import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  DownloadIcon,
  FileTextIcon,
  Loader2Icon,
  PlayIcon,
  RotateCcwIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAppForm } from "@/components/form";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import Radio from "@/components/ui/radio";
import type { SelectOption } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { useExportJobsStream } from "@/hooks/use-export-jobs-stream";
import { type ChapterListItem, listChapters } from "@/lib/chapters.functions";
import {
  cancelExportJob,
  deleteExportHistory,
  type ExportHistoryItem,
  getExportDownloadUrl,
  listExportHistory,
  startExport,
} from "@/lib/export.functions";
import type {
  ExportBitrate,
  ExportFormat,
  ExportSampleRate,
  ExportScope,
  ExportSettingsSnapshot,
  SubtitleFormat,
} from "@/types/export";
import { cn } from "@/utils/cn";
import { relativeTime } from "@/utils/datetime";

type ExportFormState = {
  scope: ExportScope;
  format: ExportFormat;
  bitrate: ExportBitrate;
  sampleRate: ExportSampleRate;
  mono: boolean;
  /** Loudness normalization on/off. Target lives in `normalizeTarget`. */
  normalize: boolean;
  /** EBU R128 target integrated loudness; only used when `normalize` is on. */
  normalizeTarget: -16 | -19 | -23;
  subtitleSrt: boolean;
  subtitleVtt: boolean;
};

const DEFAULT_BITRATE: ExportBitrate = 128;
const DEFAULT_SAMPLE_RATE: ExportSampleRate = 44100;

const SCOPE_OPTIONS: { value: ExportScope; label: string }[] = [
  { value: "chapter", label: "本章节" },
  { value: "all-merged", label: "全部章节（拼接）" },
  { value: "all-split", label: "全部章节（分轨）" },
];

const FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
  { value: "mp3", label: "MP3" },
  { value: "wav", label: "WAV" },
  { value: "m4b", label: "M4B（含章节书签 / 元数据）" },
];

const BITRATE_OPTIONS: SelectOption<ExportBitrate>[] = [
  { value: 64, label: "64 kbps" },
  { value: 96, label: "96 kbps" },
  { value: 128, label: "128 kbps" },
  { value: 192, label: "192 kbps" },
  { value: 320, label: "320 kbps" },
];

const SAMPLE_RATE_OPTIONS: SelectOption<ExportSampleRate>[] = [
  { value: 44100, label: "44.1 kHz" },
  { value: 48000, label: "48 kHz" },
];

const NORMALIZE_OPTIONS: SelectOption<-16 | -19 | -23>[] = [
  { value: -16, label: "-16 LUFS（播客 / 流媒体）" },
  { value: -19, label: "-19 LUFS（有声书 / ACX）" },
  { value: -23, label: "-23 LUFS（广播 / EBU R128）" },
];

function storageKey(projectId: number) {
  return `voxify:export-settings:${projectId}`;
}

function defaultFormState(): ExportFormState {
  return {
    scope: "chapter",
    format: "mp3",
    bitrate: DEFAULT_BITRATE,
    sampleRate: DEFAULT_SAMPLE_RATE,
    mono: true,
    normalize: true,
    normalizeTarget: -19,
    subtitleSrt: false,
    subtitleVtt: false,
  };
}

function readSavedFormState(projectId: number): Partial<ExportFormState> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return null;
    return JSON.parse(raw) as Partial<ExportFormState>;
  } catch {
    return null;
  }
}

export default function ExportPanel({
  projectId,
  chapter,
}: {
  projectId: number;
  chapter: ChapterListItem | null;
}) {
  const qc = useQueryClient();

  const fetchChapters = useServerFn(listChapters);
  const fetchHistory = useServerFn(listExportHistory);

  const [{ data: chapters = [] }, { data: history = [] }] = useQueries({
    queries: [
      {
        queryKey: ["chapters", projectId] as const,
        queryFn: () => fetchChapters({ data: { projectId } }),
      },
      {
        queryKey: ["export-history", projectId] as const,
        queryFn: () => fetchHistory({ data: { projectId } }),
      },
    ],
  });

  const baseDefaults: ExportFormState = defaultFormState();

  // Read saved state synchronously on mount so the AutoSubmit persist hook
  // below doesn't race ahead and overwrite localStorage with un-hydrated
  // defaults.
  const savedRef = useRef<Partial<ExportFormState> | null | undefined>(undefined);
  if (savedRef.current === undefined) savedRef.current = readSavedFormState(projectId);

  const startFn = useServerFn(startExport);
  const cancelFn = useServerFn(cancelExportJob);
  const deleteHistoryFn = useServerFn(deleteExportHistory);

  const startMut = useMutation({
    mutationFn: (vars: Parameters<typeof startFn>[0]["data"]) => startFn({ data: vars }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.warning("已有正在进行的导出任务");
        return;
      }
      qc.invalidateQueries({ queryKey: ["export-history", projectId] });
    },
    onError: (err) =>
      toast.error({
        title: "开始导出失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const cancelMut = useMutation({
    mutationFn: (jobId: string) => cancelFn({ data: { jobId } }),
    onError: (err) =>
      toast.error({
        title: "终止失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const [confirmingDelete, setConfirmingDelete] = useState<ExportHistoryItem | null>(null);

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteHistoryFn({ data: { id } }),
    onSuccess: () => {
      setConfirmingDelete(null);
      qc.invalidateQueries({ queryKey: ["export-history", projectId] });
    },
    onError: (err) =>
      toast.error({
        title: "删除失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  // Subscribe to export jobs SSE so the panel reacts to active jobs and
  // refreshes history on completion.
  const { jobs } = useExportJobsStream(true);
  const activeJob = jobs.find(
    (j) => j.projectId === projectId && (j.state === "active" || j.state === "waiting"),
  );

  // refresh history when our project's jobs reach terminal state
  const lastTerminal =
    jobs.find((j) => j.projectId === projectId && (j.state === "completed" || j.state === "failed"))
      ?.id ?? null;
  useEffect(() => {
    if (lastTerminal) {
      qc.invalidateQueries({ queryKey: ["export-history", projectId] });
    }
  }, [lastTerminal, projectId, qc]);

  const form = useAppForm({
    defaultValues: {
      ...defaultFormState(),
      ...(savedRef.current ?? {}),
    } as ExportFormState,
    onSubmit: ({ value }) => {
      const subtitles: SubtitleFormat[] = [];
      if (value.subtitleSrt) subtitles.push("srt");
      if (value.subtitleVtt) subtitles.push("vtt");
      startMut.mutate({
        projectId,
        scope: value.scope,
        chapterId: value.scope === "chapter" ? (chapter?.id ?? null) : null,
        format: value.format,
        bitrate: value.bitrate,
        sampleRate: value.sampleRate,
        mono: value.mono,
        normalizeLufs: value.normalize ? value.normalizeTarget : null,
        subtitles,
      });
    },
  });

  function handleResetDefaults() {
    try {
      localStorage.removeItem(storageKey(projectId));
    } catch {
      // ignore
    }
    form.reset(baseDefaults);
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-6">
      {activeJob && (
        <ActiveJobBanner
          state={activeJob.state}
          onCancel={() => cancelMut.mutate(activeJob.id)}
          cancelling={cancelMut.isPending}
        />
      )}

      {chapter && (
        <section className="flex flex-col gap-5 rounded-lg border border-content-400/15 bg-base-200 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg text-content-100">导出设置</h2>
              <p className="text-xs text-content-300">配置仅对当前项目有效，会自动保存</p>
            </div>
            <Button variant="ghost" size="sm" onClick={handleResetDefaults} disabled={!!activeJob}>
              <RotateCcwIcon />
              恢复默认
            </Button>
          </div>

          <form.AppForm>
            <form.AutoSubmit
              onSubmit={() => {
                try {
                  localStorage.setItem(storageKey(projectId), JSON.stringify(form.state.values));
                } catch {
                  // ignore quota / private-mode errors
                }
              }}
              debounceMs={300}
            >
              <FormRow
                label="导出范围"
                description={
                  chapters.length > 1
                    ? "可选导出当前章节、全部章节合并为单文件，或每个章节单独输出"
                    : undefined
                }
              >
                <form.AppField name="scope">
                  {(field) => (
                    <field.RadioGroupField<ExportScope> className="flex-row gap-5">
                      {SCOPE_OPTIONS.map((opt) => (
                        <Radio key={opt.value} value={opt.value} label={opt.label} />
                      ))}
                    </field.RadioGroupField>
                  )}
                </form.AppField>
              </FormRow>

              <FormRow label="格式与编码">
                <form.AppField name="format">
                  {(field) => (
                    <field.RadioGroupField<ExportFormat> className="flex-row gap-5">
                      {FORMAT_OPTIONS.map((opt) => (
                        <Radio key={opt.value} value={opt.value} label={opt.label} />
                      ))}
                    </field.RadioGroupField>
                  )}
                </form.AppField>
              </FormRow>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormRow label="码率" description="WAV 为无压缩格式，此项不适用">
                  <form.AppField name="bitrate">
                    {(field) => (
                      <field.SelectField<ExportBitrate>
                        options={BITRATE_OPTIONS}
                        className="w-full"
                      />
                    )}
                  </form.AppField>
                </FormRow>
                <FormRow label="采样率" description="44.1 kHz 与多数播放器兼容，48 kHz 适用于视频">
                  <form.AppField name="sampleRate">
                    {(field) => (
                      <field.SelectField<ExportSampleRate>
                        options={SAMPLE_RATE_OPTIONS}
                        className="w-full"
                      />
                    )}
                  </form.AppField>
                </FormRow>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormRow label="单声道" description="关闭后输出立体声">
                  <form.AppField name="mono">
                    {(field) => (
                      <field.SwitchField label={field.state.value ? "已开启" : "已关闭"} />
                    )}
                  </form.AppField>
                </FormRow>
                <FormRow
                  label="响度标准化"
                  description="按 EBU R128 把最终输出归一到目标响度，避免不同章节 / 项目间响度参差"
                >
                  <div className="flex flex-wrap items-center gap-4">
                    <form.AppField name="normalize">
                      {(field) => (
                        <field.SwitchField label={field.state.value ? "已开启" : "已关闭"} />
                      )}
                    </form.AppField>
                    <form.Subscribe selector={(s) => s.values.normalize}>
                      {(enabled) =>
                        enabled ? (
                          <form.AppField name="normalizeTarget">
                            {(field) => (
                              <field.SelectField options={NORMALIZE_OPTIONS} className="min-w-65" />
                            )}
                          </form.AppField>
                        ) : null
                      }
                    </form.Subscribe>
                  </div>
                </FormRow>
              </div>

              <FormRow label="字幕" description="按段落开始 / 结束时间生成；多文件时与音频一起打包">
                <div className="flex items-center gap-5">
                  <form.AppField name="subtitleSrt">
                    {(field) => <field.CheckboxField label="SRT" />}
                  </form.AppField>
                  <form.AppField name="subtitleVtt">
                    {(field) => <field.CheckboxField label="VTT" />}
                  </form.AppField>
                </div>
              </FormRow>
            </form.AutoSubmit>

            <div className="flex items-center justify-end gap-2 border-t border-content-400/10 pt-4">
              <Button
                onClick={() => form.handleSubmit()}
                disabled={!!activeJob || startMut.isPending}
              >
                <PlayIcon />
                {startMut.isPending ? "提交中…" : "开始导出"}
              </Button>
            </div>
          </form.AppForm>
        </section>
      )}

      <HistorySection history={history} onRequestDelete={setConfirmingDelete} />

      <Dialog
        open={!!confirmingDelete}
        onOpenChange={(open) => {
          if (!open && !deleteMut.isPending) setConfirmingDelete(null);
        }}
        title="确认删除导出文件"
        description={
          confirmingDelete
            ? `“${confirmingDelete.file.fileName}” 及其文件将被删除，操作不可撤销。`
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
    </div>
  );
}

function FormRow({
  label,
  description,
  children,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-sm text-content-100">{label}</div>
      {description && <p className="text-xs text-content-300">{description}</p>}
      <div className="pt-1">{children}</div>
    </div>
  );
}

function ActiveJobBanner({
  state,
  onCancel,
  cancelling,
}: {
  state: string;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const label = state === "active" ? "正在导出…" : "排队中…";
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-info/40 bg-info/10 px-4 py-3 text-sm text-content-100">
      <div className="flex items-center gap-2">
        <Loader2Icon className="size-4 animate-spin text-info" />
        <span>{label}</span>
      </div>
      <Button variant="danger" size="sm" onClick={onCancel} disabled={cancelling}>
        <SquareIcon />
        终止
      </Button>
    </div>
  );
}

function HistorySection({
  history,
  onRequestDelete,
}: {
  history: ExportHistoryItem[];
  onRequestDelete: (item: ExportHistoryItem) => void;
}) {
  const [showSnapshot, setShowSnapshot] = useState<ExportHistoryItem | null>(null);
  const getDownloadUrl = useServerFn(getExportDownloadUrl);
  const downloadMut = useMutation({
    mutationFn: (id: number) => getDownloadUrl({ data: { id } }),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
    onError: (err) =>
      toast.error({
        title: "下载失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-content-400/15 bg-base-200 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg text-content-100">导出历史</h2>
        <span className="text-xs text-content-400">{history.length} 条</span>
      </div>

      {history.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-sm text-content-400">
          暂无导出历史
        </div>
      ) : (
        <ul className="flex flex-col">
          {history.map((row, i) => (
            <li
              key={row.id}
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 py-3",
                i > 0 && "border-t border-content-400/10",
              )}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                onClick={() => setShowSnapshot(row)}
                aria-label="查看导出设置快照"
              >
                <FileTextIcon className="size-4 shrink-0 text-content-400" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm text-content-100">{row.file.fileName}</span>
                  <span className="text-xs text-content-400">
                    {relativeTime(row.createdAt)} · {formatBytes(row.file.fileSize)}
                  </span>
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  shape="circle"
                  onClick={() => downloadMut.mutate(row.id)}
                  disabled={downloadMut.isPending && downloadMut.variables === row.id}
                  aria-label="下载"
                  title="下载"
                >
                  <DownloadIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  shape="circle"
                  onClick={() => onRequestDelete(row)}
                  aria-label="删除"
                  title="删除"
                >
                  <Trash2Icon />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <SnapshotDialog
        open={!!showSnapshot}
        onOpenChange={(o) => !o && setShowSnapshot(null)}
        item={showSnapshot}
      />
    </section>
  );
}

function SnapshotDialog({
  open,
  onOpenChange,
  item,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ExportHistoryItem | null;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="导出设置快照"
      description={item ? item.file.fileName : undefined}
      size="md"
    >
      {item && (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
          <SnapshotRow label="范围" value={scopeLabel(item.settings.scope)} />
          <SnapshotRow label="格式" value={item.settings.format.toUpperCase()} />
          <SnapshotRow label="码率" value={`${item.settings.bitrate} kbps`} />
          <SnapshotRow
            label="采样率"
            value={`${(item.settings.sampleRate / 1000).toFixed(1)} kHz`}
          />
          <SnapshotRow label="声道" value={item.settings.mono ? "单声道" : "立体声"} />
          <SnapshotRow
            label="响度标准化"
            value={
              item.settings.normalizeLufs == null ? "关闭" : `${item.settings.normalizeLufs} LUFS`
            }
          />
          <SnapshotRow
            label="字幕"
            value={
              item.settings.subtitles.length === 0
                ? "无"
                : item.settings.subtitles.map((s) => s.toUpperCase()).join(", ")
            }
          />
          <SnapshotRow label="段落间隔" value={`${item.settings.segmentGapMs} ms`} />
          <SnapshotRow label="章节间隔" value={`${item.settings.chapterGapMs} ms`} />
          {item.settings.chapterName && (
            <SnapshotRow label="章节" value={item.settings.chapterName} />
          )}
        </dl>
      )}
    </Dialog>
  );
}

function SnapshotRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-content-400">{label}</dt>
      <dd className="text-content-100">{value}</dd>
    </>
  );
}

function scopeLabel(scope: ExportScope | ExportSettingsSnapshot["scope"]) {
  if (scope === "chapter") return "本章节";
  if (scope === "all-merged") return "全部章节（拼接）";
  return "全部章节（分轨）";
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  const formatted = value >= 10 || i === 0 ? value.toFixed(0) : value.toFixed(1);
  return `${formatted} ${units[i]}`;
}
