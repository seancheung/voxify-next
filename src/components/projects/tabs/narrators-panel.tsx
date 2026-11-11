import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontalIcon, PencilIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useEffect, useState } from "react";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import Dropdown from "@/components/ui/dropdown";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Textarea from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import Tooltip from "@/components/ui/tooltip";
import VoiceSelect from "@/components/voice-select";
import { getProject } from "@/lib/chapters.functions";
import {
  deleteNarrator,
  listNarrators,
  type NarratorListItem,
  updateNarrator,
} from "@/lib/narrators.functions";
import { updateProjectVoice } from "@/lib/projects.functions";
import type { CustomArgs, VoiceSettings } from "@/types/tts";
import NarratorEditDialog from "../narrator-edit-dialog";

function serializeCustomArgs(args: CustomArgs | undefined): string {
  if (!args || Object.keys(args).length === 0) return "";
  return JSON.stringify(args, null, 2);
}

function parseCustomArgs(raw: string): { ok: true; value: CustomArgs | undefined } | { ok: false } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: undefined };
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { ok: false };
    }
    return { ok: true, value: parsed as CustomArgs };
  } catch {
    return { ok: false };
  }
}

export default function NarratorsPanel({ projectId }: { projectId: number }) {
  const qc = useQueryClient();
  const fetchNarrators = useServerFn(listNarrators);
  const updateFn = useServerFn(updateNarrator);
  const deleteFn = useServerFn(deleteNarrator);
  const fetchProject = useServerFn(getProject);

  const { data: narratorData } = useQuery({
    queryKey: ["narrators", projectId],
    queryFn: () => fetchNarrators({ data: { projectId } }),
  });
  const narratorList = narratorData?.items ?? [];
  const unassignedCount = narratorData?.unassignedCount ?? 0;

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => fetchProject({ data: { id: projectId } }),
  });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<NarratorListItem | null>(null);
  const [editingDefault, setEditingDefault] = useState(false);
  const [deletingConfirm, setDeletingConfirm] = useState<NarratorListItem | null>(null);

  const updateVoiceMut = useMutation({
    mutationFn: ({ narrator, voiceId }: { narrator: NarratorListItem; voiceId: number | null }) =>
      updateFn({
        data: {
          id: narrator.id,
          name: narrator.name,
          voiceId,
          voiceSettings: narrator.voiceSettings,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["narrators", projectId] });
      qc.invalidateQueries({ queryKey: ["segments"] });
    },
    onError: (err) =>
      toast.error({
        title: "更新失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["narrators", projectId] });
      qc.invalidateQueries({ queryKey: ["segments"] });
      toast.success("已删除角色");
    },
    onError: (err) =>
      toast.error({
        title: "删除失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  function handleDelete(narrator: NarratorListItem) {
    if (narrator.usageCount > 0) {
      setDeletingConfirm(narrator);
    } else {
      deleteMut.mutate(narrator.id);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-sm text-content-300">
          共 {narratorList.length} 个角色（跨章节共享）
        </div>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon />
          新建角色
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>角色名称</TableHead>
            <TableHead className="w-72">声音</TableHead>
            <TableHead>使用情况</TableHead>
            <TableHead className="w-32 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <DefaultNarratorRow
            projectId={projectId}
            voiceId={project?.voiceId ?? null}
            voiceSettings={project?.settings?.voiceSettings ?? null}
            unassignedCount={unassignedCount}
            onEdit={() => setEditingDefault(true)}
          />
          {narratorList.map((narrator) => (
            <NarratorRow
              key={narrator.id}
              narrator={narrator}
              onChangeVoice={(voiceId) => updateVoiceMut.mutate({ narrator, voiceId })}
              onEdit={() => setEditing(narrator)}
              onDelete={() => handleDelete(narrator)}
            />
          ))}
        </TableBody>
      </Table>

      <NarratorEditDialog
        projectId={projectId}
        narrator={creating ? null : editing}
        open={creating || !!editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
      />

      <DefaultNarratorEditDialog
        projectId={projectId}
        voiceSettings={project?.settings?.voiceSettings ?? null}
        open={editingDefault}
        onOpenChange={setEditingDefault}
      />

      <Dialog
        open={!!deletingConfirm}
        onOpenChange={(open) => {
          if (!open) setDeletingConfirm(null);
        }}
        title="确认删除角色"
        description={
          deletingConfirm
            ? `角色 "${deletingConfirm.name}" 已被 ${deletingConfirm.usageCount} 个段落引用，删除后这些段落将回退到默认（无角色），是否继续？`
            : undefined
        }
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeletingConfirm(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              disabled={deleteMut.isPending}
              onClick={() => {
                if (!deletingConfirm) return;
                deleteMut.mutate(deletingConfirm.id, {
                  onSuccess: () => setDeletingConfirm(null),
                });
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

function DefaultNarratorRow({
  projectId,
  voiceId,
  voiceSettings,
  unassignedCount,
  onEdit,
}: {
  projectId: number;
  voiceId: number | null;
  voiceSettings: VoiceSettings | null;
  unassignedCount: number;
  onEdit: () => void;
}) {
  const qc = useQueryClient();
  const saveVoice = useServerFn(updateProjectVoice);

  const saveMut = useMutation({
    mutationFn: (nextVoiceId: number | null) =>
      saveVoice({
        data: { id: projectId, voiceId: nextVoiceId, voiceSettings },
      }),
    onSuccess: (result) => {
      qc.setQueryData(["project", projectId], (prev: Record<string, unknown> | undefined) => {
        if (!prev) return prev;
        return {
          ...prev,
          voiceId: result.voiceId,
          settings: {
            ...((prev.settings as Record<string, unknown>) ?? {}),
            voiceSettings: result.voiceSettings,
          },
        };
      });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err) =>
      toast.error({
        title: "更新失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  return (
    <TableRow>
      <TableCell>
        <Tooltip content="未指定角色的段落使用">
          <span className="text-content-400">默认</span>
        </Tooltip>
      </TableCell>
      <TableCell>
        <VoiceSelect
          value={voiceId}
          onChange={(id) => saveMut.mutate(id)}
          dialogTitle="选择项目默认声音"
        />
      </TableCell>
      <TableCell>
        {unassignedCount > 0 ? (
          <Badge size="sm" variant="info">
            被 {unassignedCount} 个段落引用
          </Badge>
        ) : (
          <Badge size="sm" variant="secondary">
            未使用
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="sm"
          shape="circle"
          aria-label="编辑默认角色参数"
          onClick={onEdit}
        >
          <PencilIcon />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function DefaultNarratorEditDialog({
  projectId,
  voiceSettings,
  open,
  onOpenChange,
}: {
  projectId: number;
  voiceSettings: VoiceSettings | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const saveVoice = useServerFn(updateProjectVoice);

  const [customArgsText, setCustomArgsText] = useState("");
  const [customArgsError, setCustomArgsError] = useState("");

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on open
  useEffect(() => {
    if (open) {
      setCustomArgsText(serializeCustomArgs(voiceSettings?.customArgs));
      setCustomArgsError("");
    }
  }, [open]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const parsed = parseCustomArgs(customArgsText);
      if (!parsed.ok) {
        throw new Error("自定义参数不是合法的 JSON 对象");
      }
      const customArgs = parsed.value;
      const vs: VoiceSettings | null =
        customArgs || voiceSettings?.speed?.trim() || voiceSettings?.instructions?.trim()
          ? {
              ...(voiceSettings?.speed?.trim() ? { speed: voiceSettings.speed } : {}),
              ...(voiceSettings?.instructions?.trim()
                ? { instructions: voiceSettings.instructions }
                : {}),
              ...(customArgs ? { customArgs } : {}),
            }
          : null;

      const projectData = qc.getQueryData<Record<string, unknown>>(["project", projectId]);
      const currentVoiceId = (projectData?.voiceId as number | null | undefined) ?? null;

      return saveVoice({
        data: { id: projectId, voiceId: currentVoiceId, voiceSettings: vs },
      });
    },
    onSuccess: (result) => {
      qc.setQueryData(["project", projectId], (prev: Record<string, unknown> | undefined) => {
        if (!prev) return prev;
        return {
          ...prev,
          voiceId: result.voiceId,
          settings: {
            ...((prev.settings as Record<string, unknown>) ?? {}),
            voiceSettings: result.voiceSettings,
          },
        };
      });
      qc.invalidateQueries({ queryKey: ["projects"] });
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error({
        title: "保存失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const submitting = saveMut.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="编辑默认角色"
      description="未指定角色的段落将使用此默认声音配置。"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button disabled={submitting} onClick={() => saveMut.mutate()}>
            {submitting ? "保存中…" : "保存"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-content-200">自定义参数</label>
          <Textarea
            value={customArgsText}
            onChange={(v) => {
              setCustomArgsText(v);
              const trimmed = v.trim();
              if (!trimmed) {
                setCustomArgsError("");
              } else {
                const result = parseCustomArgs(v);
                setCustomArgsError(result.ok ? "" : "请输入合法的 JSON 对象");
              }
            }}
            placeholder='例如：{"emotion": "happy", "language": "zh"}'
            rows={3}
            className="w-full font-mono text-xs"
          />
          {customArgsError && <span className="text-xs text-error">{customArgsError}</span>}
          <span className="text-xs text-content-400">
            JSON 格式，合成时将作为额外请求参数发送（优先级低于标准参数）
          </span>
        </div>
      </div>
    </Dialog>
  );
}

function NarratorRow({
  narrator,
  onChangeVoice,
  onEdit,
  onDelete,
}: {
  narrator: NarratorListItem;
  onChangeVoice: (voiceId: number | null) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const inUse = narrator.usageCount > 0;

  return (
    <TableRow>
      <TableCell>
        <span className="truncate" style={{ color: narratorColor(narrator.name) }}>
          {narrator.name}
        </span>
      </TableCell>
      <TableCell>
        <VoiceSelect
          value={narrator.voiceId}
          onChange={(id) => onChangeVoice(id)}
          placeholder="使用项目默认"
          dialogTitle={`为 "${narrator.name}" 选择声音`}
        />
      </TableCell>
      <TableCell>
        {inUse ? (
          <Badge size="sm" variant="info">
            被 {narrator.usageCount} 个段落引用
          </Badge>
        ) : (
          <Badge size="sm" variant="secondary">
            未使用
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <Dropdown
          align="end"
          items={[
            {
              key: "edit",
              label: "编辑",
              icon: <PencilIcon />,
              onSelect: onEdit,
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
          <Button variant="ghost" size="sm" shape="circle" aria-label="更多操作">
            <MoreHorizontalIcon />
          </Button>
        </Dropdown>
      </TableCell>
    </TableRow>
  );
}

import { narratorColor } from "@/utils/narrator-color";
