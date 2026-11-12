import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { t } from "@/i18n";
import { type ChapterListItem, createChapter, updateChapter } from "@/lib/chapters.functions";

const formSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: () => t("Enter a chapter name") })
    .max(120),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
});

type FormValues = z.input<typeof formSchema>;

export default function ChapterDialog({
  projectId,
  chapter,
  open,
  onOpenChange,
  onCreated,
}: {
  projectId: number;
  chapter: ChapterListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (chapter: ChapterListItem) => void;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createChapter);
  const update = useServerFn(updateChapter);
  const isEdit = !!chapter;

  const createMutation = useMutation({
    mutationFn: (input: { name: string; description: string }) =>
      create({
        data: {
          projectId,
          name: input.name,
          description: input.description,
        },
      }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["chapters", projectId] });
      onCreated?.(created);
      handleOpenChange(false);
    },
    onError: (err) => {
      toast.error({
        title: t("Creation failed"),
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: number; name: string; description: string }) =>
      update({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chapters", projectId] });
      handleOpenChange(false);
    },
    onError: (err) => {
      toast.error({
        title: t("Update failed"),
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });

  const form = useAppForm({
    defaultValues: {
      name: chapter?.name ?? "",
      description: chapter?.description ?? "",
    } as FormValues,
    validators: {
      onSubmit: formSchema,
    },
    onSubmit: ({ value }) => {
      const description = value.description ?? "";
      if (isEdit && chapter) {
        updateMutation.mutate({
          id: chapter.id,
          name: value.name,
          description,
        });
      } else {
        createMutation.mutate({
          name: value.name,
          description,
        });
      }
    },
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset form when target chapter changes
  useEffect(() => {
    if (open) {
      form.reset({
        name: chapter?.name ?? "",
        description: chapter?.description ?? "",
      });
    }
  }, [open, chapter?.id]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      createMutation.reset();
      updateMutation.reset();
    }
    onOpenChange(next);
  }

  const submitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title={isEdit ? t("Edit chapter") : t("New chapter")}
      description={isEdit ? t("Edit chapter details") : t("Add a chapter to this project")}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={submitting}>
            {t("Cancel")}
          </Button>
          <Button disabled={submitting} onClick={() => form.handleSubmit()}>
            {submitting
              ? isEdit
                ? t("Saving…")
                : t("Creating…")
              : isEdit
                ? t("Save")
                : t("Create")}
          </Button>
        </>
      }
    >
      <form.AppForm>
        <div className="flex flex-col gap-4">
          <form.AppField name="name">
            {(field) => (
              <field.FormField label={t("Name")}>
                <field.InputField placeholder={t("Example: Chapter One")} autoFocus />
              </field.FormField>
            )}
          </form.AppField>
          <form.AppField name="description">
            {(field) => (
              <field.FormField label={t("Description")}>
                <field.TextareaField
                  placeholder={t("Optional chapter summary")}
                  rows={4}
                  className="w-full"
                />
              </field.FormField>
            )}
          </form.AppField>
        </div>
      </form.AppForm>
    </Dialog>
  );
}
