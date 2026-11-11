import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import type { SelectOption } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { listNarrators } from "@/lib/narrators.functions";
import {
  type SegmentListItem,
  updateSegment,
  type updateSegmentSchema,
} from "@/lib/segments.functions";

const formSchema = z.object({
  content: z.string().trim().max(20000),
  narratorId: z.number().int().positive().nullable(),
  speed: z.string().trim().max(40).optional().or(z.literal("")),
  instructions: z.string().trim().max(2000).optional().or(z.literal("")),
  leadingSilence: z.number().int().min(0).max(600_000).nullable(),
  trailingSilence: z.number().int().min(0).max(600_000).nullable(),
});

type FormValues = z.input<typeof formSchema>;

function sanitizeSegmentContent(input: string): string {
  return input
    .replace(/\r?\n/g, "")
    .replace(/^\s*\[\[[^\]]*\]\]/, "")
    .trim();
}

export default function SegmentEditDialog({
  segment,
  chapterId,
  projectId,
  open,
  onOpenChange,
}: {
  segment: SegmentListItem | null;
  chapterId: number;
  projectId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const fetchNarrators = useServerFn(listNarrators);
  const update = useServerFn(updateSegment);

  const { data: narratorData } = useQuery({
    queryKey: ["narrators", projectId],
    queryFn: () => fetchNarrators({ data: { projectId } }),
    enabled: open,
  });
  const narratorList = narratorData?.items ?? [];

  const updateMut = useMutation({
    mutationFn: (input: z.input<typeof updateSegmentSchema>) => update({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["segments", chapterId] });
      // Edits can flip a segment's isStale, which feeds the chapter list
      // completion / stale indicator — refresh the chapter list too.
      qc.invalidateQueries({ queryKey: ["chapters", projectId] });
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error({
        title: "保存失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const form = useAppForm({
    defaultValues: {
      content: segment?.content ?? "",
      narratorId: segment?.narratorId ?? null,
      speed: segment?.voiceSettings?.speed ?? "",
      instructions: segment?.voiceSettings?.instructions ?? "",
      leadingSilence: segment?.leadingSilence ?? null,
      trailingSilence: segment?.trailingSilence ?? null,
    } as FormValues,
    validators: { onSubmit: formSchema },
    onSubmit: ({ value }) => {
      if (!segment) return;
      const speed = (value.speed ?? "").trim();
      const instructions = (value.instructions ?? "").trim();
      const voiceSettings =
        speed || instructions
          ? {
              ...(speed ? { speed } : {}),
              ...(instructions ? { instructions } : {}),
            }
          : null;
      updateMut.mutate({
        id: segment.id,
        content: sanitizeSegmentContent(value.content),
        narratorId: value.narratorId ?? null,
        voiceSettings,
        leadingSilence: value.leadingSilence,
        trailingSilence: value.trailingSilence,
      });
    },
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on open or segment change
  useEffect(() => {
    if (open && segment) {
      form.reset({
        content: segment.content ?? "",
        narratorId: segment.narratorId ?? null,
        speed: segment.voiceSettings?.speed ?? "",
        instructions: segment.voiceSettings?.instructions ?? "",
        leadingSilence: segment.leadingSilence ?? null,
        trailingSilence: segment.trailingSilence ?? null,
      });
    }
  }, [open, segment?.id]);

  const narratorOptions: SelectOption<number>[] = narratorList.map((n) => ({
    value: n.id,
    label: n.name,
  }));

  const submitting = updateMut.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="编辑段落"
      description="保存后段落会被标记为有更新，需要重新生成音频"
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
          <form.AppField name="content">
            {(field) => (
              <field.FormField label="文本">
                <field.TextareaField rows={6} className="w-full" />
              </field.FormField>
            )}
          </form.AppField>
          <form.AppField name="narratorId">
            {(field) => (
              <field.FormField label="角色">
                <field.SelectField<number>
                  options={narratorOptions}
                  className="w-full"
                  placeholder="默认（无角色）"
                  clearable
                />
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
          <div className="grid grid-cols-2 gap-4">
            <form.AppField name="leadingSilence">
              {(field) => (
                <field.FormField label="前置留白 (ms)" description="留空使用默认值">
                  <field.NumberField
                    integer
                    clearable
                    min={0}
                    max={600_000}
                    placeholder="默认"
                    className="w-full"
                  />
                </field.FormField>
              )}
            </form.AppField>
            <form.AppField name="trailingSilence">
              {(field) => (
                <field.FormField label="后置留白 (ms)" description="留空使用默认值">
                  <field.NumberField
                    integer
                    clearable
                    min={0}
                    max={600_000}
                    placeholder="默认"
                    className="w-full"
                  />
                </field.FormField>
              )}
            </form.AppField>
          </div>
        </div>
      </form.AppForm>
    </Dialog>
  );
}
