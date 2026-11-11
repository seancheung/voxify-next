import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type z from "zod";
import { useAppForm } from "@/components/form";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import type { SelectOption } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { DEFAULT_LOCALE, LOCALES, type LocaleCode } from "@/constants/locale";
import { createProject, createProjectSchema } from "@/lib/projects.functions";

type CreateProjectInput = z.input<typeof createProjectSchema>;

const localeOptions: SelectOption<LocaleCode>[] = LOCALES.map((l) => ({
  value: l.value,
  label: l.label,
}));

export default function NewProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createProject);

  const submitMutation = useMutation({
    mutationFn: (input: CreateProjectInput) => create({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      handleOpenChange(false);
    },
    onError: (err) => {
      toast.error({
        title: "创建失败",
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });

  const form = useAppForm({
    defaultValues: {
      name: "",
      author: "",
      description: "",
      locale: DEFAULT_LOCALE,
    } as CreateProjectInput,
    validators: {
      onSubmit: createProjectSchema,
    },
    onSubmit: ({ value }) => {
      submitMutation.mutate(value);
    },
  });

  function handleOpenChange(next: boolean) {
    form.reset();
    submitMutation.reset();
    onOpenChange(next);
  }

  const submitting = submitMutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title="新建项目"
      description="填写项目基本信息，稍后可在项目内继续编辑"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button form="new-project-form" disabled={submitting} onClick={() => form.handleSubmit()}>
            {submitting ? "创建中…" : "创建"}
          </Button>
        </>
      }
    >
      <form.AppForm>
        <div className="flex flex-col gap-4">
          <form.AppField name="name">
            {(field) => (
              <field.FormField label="名称">
                <field.InputField placeholder="例如：小王子" autoFocus />
              </field.FormField>
            )}
          </form.AppField>
          <form.AppField name="author">
            {(field) => (
              <field.FormField label="作者">
                <field.InputField placeholder="可选" />
              </field.FormField>
            )}
          </form.AppField>
          <form.AppField name="description">
            {(field) => (
              <field.FormField label="描述">
                <field.InputField placeholder="可选，简要介绍这个项目" />
              </field.FormField>
            )}
          </form.AppField>
          <form.AppField name="locale">
            {(field) => (
              <field.FormField label="语言">
                <field.SelectField options={localeOptions} className="w-full" />
              </field.FormField>
            )}
          </form.AppField>
          {submitMutation.isError && (
            <form.FormError className="mx-auto max-w-md">
              {submitMutation.error.message}
            </form.FormError>
          )}
        </div>
      </form.AppForm>
    </Dialog>
  );
}
