import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import type z from "zod";
import { useAppForm } from "@/components/form";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { t } from "@/i18n";
import {
  createPrompt,
  createPromptSchema,
  type PromptListItem,
  updatePrompt,
} from "@/lib/prompts.functions";

type PromptFormValues = z.input<typeof createPromptSchema>;

const EMPTY: PromptFormValues = { name: "", description: "", content: "" };

function toFormValues(prompt: PromptListItem | null): PromptFormValues {
  if (!prompt) return EMPTY;
  return {
    name: prompt.name,
    description: prompt.description ?? "",
    content: prompt.content,
  };
}

export default function PromptDialog({
  open,
  onOpenChange,
  prompt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: PromptListItem | null;
}) {
  const isEdit = !!prompt;
  const qc = useQueryClient();
  const create = useServerFn(createPrompt);
  const update = useServerFn(updatePrompt);

  const submitMutation = useMutation({
    mutationFn: (input: PromptFormValues) =>
      prompt ? update({ data: { ...input, id: prompt.id } }) : create({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prompts"] });
      handleOpenChange(false);
    },
    onError: (err) =>
      toast.error({
        title: isEdit ? t("Update failed") : t("Failed to add"),
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const form = useAppForm({
    defaultValues: toFormValues(prompt),
    validators: { onSubmit: createPromptSchema },
    onSubmit: ({ value }) => {
      submitMutation.mutate(value);
    },
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: only sync when the dialog opens or the target prompt changes
  useEffect(() => {
    if (open) {
      form.reset(toFormValues(prompt));
      submitMutation.reset();
    }
  }, [open, prompt]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      form.reset(EMPTY);
      submitMutation.reset();
    }
    onOpenChange(next);
  }

  const submitting = submitMutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) handleOpenChange(next);
      }}
      title={isEdit ? t("Edit prompt") : t("Add prompt")}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={submitting}>
            {t("Cancel")}
          </Button>
          <Button disabled={submitting} onClick={() => form.handleSubmit()}>
            {submitting ? t("Saving…") : isEdit ? t("Save") : t("Add")}
          </Button>
        </>
      }
    >
      <form.AppForm>
        <div className="flex flex-col gap-4">
          <form.AppField name="name">
            {(field) => (
              <field.FormField label={t("Name")}>
                <field.InputField placeholder={t("Example: Character recognition")} autoFocus />
              </field.FormField>
            )}
          </form.AppField>
          <form.AppField name="description">
            {(field) => (
              <field.FormField label={t("Description")}>
                <field.InputField placeholder={t("Optional description of this prompt")} />
              </field.FormField>
            )}
          </form.AppField>
          <form.AppField name="content">
            {(field) => (
              <field.FormField label={t("Prompt content")}>
                <field.TextareaField
                  rows={12}
                  placeholder={t("Describe the task. Variable placeholders are supported.")}
                  className="font-mono"
                />
              </field.FormField>
            )}
          </form.AppField>
          {submitMutation.isError && (
            <form.FormError>{submitMutation.error.message}</form.FormError>
          )}
        </div>
      </form.AppForm>
    </Dialog>
  );
}
