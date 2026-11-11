import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { useAppForm } from "@/components/form";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import {
  renameVoiceDesign,
  renameVoiceDesignSchema,
  type VoiceDesignListItem,
} from "@/lib/voice-designs.functions";

export default function VoiceDesignRenameDialog({
  open,
  onOpenChange,
  design,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  design: VoiceDesignListItem | null;
}) {
  const qc = useQueryClient();
  const rename = useServerFn(renameVoiceDesign);

  const mutation = useMutation({
    mutationFn: (input: { id: number; name: string }) => rename({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voice-designs"] });
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error({
        title: "更新失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const form = useAppForm({
    defaultValues: { id: design?.id ?? 0, name: design?.name ?? "" },
    validators: { onSubmit: renameVoiceDesignSchema },
    onSubmit: ({ value }) => mutation.mutate(value),
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: only resync when the dialog opens or the design changes
  useEffect(() => {
    if (open && design) {
      form.reset({ id: design.id, name: design.name });
      mutation.reset();
    }
  }, [open, design]);

  const submitting = mutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) onOpenChange(next);
      }}
      title="重命名"
      size="sm"
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
              <field.FormField label="名称">
                <field.InputField autoFocus />
              </field.FormField>
            )}
          </form.AppField>
          {mutation.isError && <form.FormError>{mutation.error.message}</form.FormError>}
        </div>
      </form.AppForm>
    </Dialog>
  );
}
