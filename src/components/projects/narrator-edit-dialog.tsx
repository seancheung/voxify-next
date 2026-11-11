import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import Textarea from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { createNarrator, type NarratorListItem, updateNarrator } from "@/lib/narrators.functions";
import type { CustomArgs } from "@/types/tts";

const formSchema = z.object({
  name: z.string().trim().min(1, "请输入角色名称").max(120),
  speed: z.string().trim().max(40).optional().or(z.literal("")),
  instructions: z.string().trim().max(2000).optional().or(z.literal("")),
});

type FormValues = z.input<typeof formSchema>;

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

export default function NarratorEditDialog({
  projectId,
  narrator,
  open,
  onOpenChange,
}: {
  projectId: number;
  narrator: NarratorListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createNarrator);
  const update = useServerFn(updateNarrator);

  const isEditing = narrator != null;

  const [customArgsText, setCustomArgsText] = useState("");
  const [customArgsError, setCustomArgsError] = useState("");

  const saveMut = useMutation({
    mutationFn: async (value: FormValues) => {
      const speed = (value.speed ?? "").trim();
      const instructions = (value.instructions ?? "").trim();
      const parsed = parseCustomArgs(customArgsText);
      if (!parsed.ok) {
        throw new Error("自定义参数不是合法的 JSON 对象");
      }
      const customArgs = parsed.value;
      const voiceSettings =
        speed || instructions || customArgs
          ? {
              ...(speed ? { speed } : {}),
              ...(instructions ? { instructions } : {}),
              ...(customArgs ? { customArgs } : {}),
            }
          : null;
      if (narrator) {
        return update({
          data: {
            id: narrator.id,
            name: value.name,
            voiceId: narrator.voiceId,
            voiceSettings,
          },
        });
      }
      return create({
        data: {
          projectId,
          name: value.name,
          voiceId: null,
          voiceSettings,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["narrators", projectId] });
      qc.invalidateQueries({ queryKey: ["segments"] });
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error({
        title: isEditing ? "保存失败" : "创建失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const form = useAppForm({
    defaultValues: {
      name: narrator?.name ?? "",
      speed: narrator?.voiceSettings?.speed ?? "",
      instructions: narrator?.voiceSettings?.instructions ?? "",
    } as FormValues,
    validators: { onSubmit: formSchema },
    onSubmit: ({ value }) => saveMut.mutate(value),
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on open or narrator change
  useEffect(() => {
    if (open) {
      form.reset({
        name: narrator?.name ?? "",
        speed: narrator?.voiceSettings?.speed ?? "",
        instructions: narrator?.voiceSettings?.instructions ?? "",
      });
      setCustomArgsText(serializeCustomArgs(narrator?.voiceSettings?.customArgs));
      setCustomArgsError("");
    }
  }, [open, narrator?.id]);

  const submitting = saveMut.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? "编辑角色" : "新建角色"}
      description="角色为项目级别，跨章节共享。同一项目内角色名称需唯一。"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button disabled={submitting} onClick={() => form.handleSubmit()}>
            {submitting ? "保存中…" : "保存"}
          </Button>
        </>
      }
    >
      <form.AppForm>
        <div className="flex flex-col gap-4">
          <form.AppField name="name">
            {(field) => (
              <field.FormField label="角色名称">
                <field.InputField placeholder="例如：旁白、Alice" />
              </field.FormField>
            )}
          </form.AppField>
          <div className="grid grid-cols-2 gap-4">
            <form.AppField name="speed">
              {(field) => (
                <field.FormField label="语速" description="覆盖默认语速，例如 1.0、1.25">
                  <field.InputField placeholder="留空使用默认" />
                </field.FormField>
              )}
            </form.AppField>
            <form.AppField name="instructions">
              {(field) => (
                <field.FormField label="指令" description="部分服务支持的语气/情感描述">
                  <field.InputField placeholder="留空使用默认" />
                </field.FormField>
              )}
            </form.AppField>
          </div>
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
      </form.AppForm>
    </Dialog>
  );
}
