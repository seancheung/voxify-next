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
import { t } from "@/i18n";
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
        title: t("Update failed"),
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["narrators", projectId] });
      qc.invalidateQueries({ queryKey: ["segments"] });
      toast.success(t("Deleted character"));
    },
    onError: (err) =>
      toast.error({
        title: t("Deletion failed"),
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
          {t("{0} characters shared across chapters", narratorList.length)}
        </div>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon />
          {t("New character")}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("Character name")}</TableHead>
            <TableHead className="w-72">{t("Voice")}</TableHead>
            <TableHead>{t("Usage")}</TableHead>
            <TableHead className="w-32 text-right">{t("Actions")}</TableHead>
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
        title={t("Delete character?")}
        description={
          deletingConfirm
            ? t(
                "Character “{0}” is used by {1} segments. Delete it and switch those segments to the default character?",
                deletingConfirm.name,
                deletingConfirm.usageCount,
              )
            : undefined
        }
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeletingConfirm(null)}>
              {t("Cancel")}
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
              {deleteMut.isPending ? t("Deleting…") : t("Confirm deletion")}
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
        title: t("Update failed"),
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  return (
    <TableRow>
      <TableCell>
        <Tooltip content={t("Used for segments without a character")}>
          <span className="text-content-400">{t("Default")}</span>
        </Tooltip>
      </TableCell>
      <TableCell>
        <VoiceSelect
          value={voiceId}
          onChange={(id) => saveMut.mutate(id)}
          dialogTitle={t("Choose the default project voice")}
        />
      </TableCell>
      <TableCell>
        {unassignedCount > 0 ? (
          <Badge size="sm" variant="info">
            {t("Used by {0} segments", unassignedCount)}
          </Badge>
        ) : (
          <Badge size="sm" variant="secondary">
            {t("Unused")}
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="sm"
          shape="circle"
          aria-label={t("Edit default character parameters")}
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
        throw new Error(t("Custom parameters must be a valid JSON object"));
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
        title: t("Save failed"),
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const submitting = saveMut.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("Edit default character")}
      description={t("Segments without a character use these voice settings.")}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("Cancel")}
          </Button>
          <Button disabled={submitting} onClick={() => saveMut.mutate()}>
            {submitting ? t("Saving…") : t("Save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-content-200">{t("Custom parameters")}</label>
          <Textarea
            value={customArgsText}
            onChange={(v) => {
              setCustomArgsText(v);
              const trimmed = v.trim();
              if (!trimmed) {
                setCustomArgsError("");
              } else {
                const result = parseCustomArgs(v);
                setCustomArgsError(result.ok ? "" : t("Enter a valid JSON object"));
              }
            }}
            placeholder={t('Example: {"emotion": "happy", "language": "zh"}')}
            rows={3}
            className="w-full font-mono text-xs"
          />
          {customArgsError && <span className="text-xs text-error">{customArgsError}</span>}
          <span className="text-xs text-content-400">
            {t("Extra synthesis parameters in JSON. Standard parameters take precedence.")}
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
          placeholder={t("Use project default")}
          dialogTitle={t("Choose a voice for “{0}”", narrator.name)}
        />
      </TableCell>
      <TableCell>
        {inUse ? (
          <Badge size="sm" variant="info">
            {t("Used by {0} segments", narrator.usageCount)}
          </Badge>
        ) : (
          <Badge size="sm" variant="secondary">
            {t("Unused")}
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <Dropdown
          align="end"
          items={[
            {
              key: "edit",
              label: t("Edit"),
              icon: <PencilIcon />,
              onSelect: onEdit,
            },
            { type: "separator" },
            {
              key: "delete",
              label: t("Delete"),
              icon: <TrashIcon />,
              danger: true,
              onSelect: onDelete,
            },
          ]}
        >
          <Button variant="ghost" size="sm" shape="circle" aria-label={t("More actions")}>
            <MoreHorizontalIcon />
          </Button>
        </Dropdown>
      </TableCell>
    </TableRow>
  );
}

import { narratorColor } from "@/utils/narrator-color";
