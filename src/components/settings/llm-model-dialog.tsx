import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import type z from "zod";
import { useAppForm } from "@/components/form";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import type { SelectOption } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import {
  createLLMModel,
  createLLMModelSchema,
  type LLMModelListItem,
  updateLLMModel,
} from "@/lib/llm-models.functions";
import { listLLMServices } from "@/lib/llm-services.functions";

type LLMModelFormValues = z.input<typeof createLLMModelSchema>;

const EMPTY: LLMModelFormValues = {
  llmServiceId: 0,
  key: "",
  name: "",
  description: "",
};

function toFormValues(
  model: LLMModelListItem | null,
  defaultServiceId: number | null,
): LLMModelFormValues {
  if (!model) {
    return { ...EMPTY, llmServiceId: defaultServiceId ?? 0 };
  }
  return {
    llmServiceId: model.llmServiceId,
    key: model.key,
    name: model.name,
    description: model.description ?? "",
  };
}

export default function LLMModelDialog({
  open,
  onOpenChange,
  model,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: LLMModelListItem | null;
}) {
  const isEdit = !!model;
  const qc = useQueryClient();
  const create = useServerFn(createLLMModel);
  const update = useServerFn(updateLLMModel);
  const fetchServices = useServerFn(listLLMServices);

  const { data: services = [] } = useQuery({
    queryKey: ["llm-services"],
    queryFn: () => fetchServices(),
  });

  const serviceOptions: SelectOption<number>[] = services.map((s) => ({
    value: s.id,
    label: s.name,
  }));

  const defaultServiceId = services[0]?.id ?? null;

  const submitMutation = useMutation({
    mutationFn: (input: LLMModelFormValues) =>
      model ? update({ data: { ...input, id: model.id } }) : create({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["llm-models"] });
      handleOpenChange(false);
    },
    onError: (err) =>
      toast.error({
        title: isEdit ? "更新失败" : "添加失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const form = useAppForm({
    defaultValues: toFormValues(model, defaultServiceId),
    validators: { onSubmit: createLLMModelSchema },
    onSubmit: ({ value }) => {
      submitMutation.mutate(value);
    },
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: only sync when the dialog opens or the target model changes
  useEffect(() => {
    if (open) {
      form.reset(toFormValues(model, defaultServiceId));
      submitMutation.reset();
    }
  }, [open, model, defaultServiceId]);

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
      title={isEdit ? "编辑模型" : "添加模型"}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button disabled={submitting} onClick={() => form.handleSubmit()}>
            {submitting ? "保存中…" : isEdit ? "保存" : "添加"}
          </Button>
        </>
      }
    >
      <form.AppForm>
        <div className="flex flex-col gap-4">
          <form.AppField name="llmServiceId">
            {(field) => (
              <field.FormField
                label="所属服务"
                description={isEdit ? "编辑模式下不可修改所属服务" : undefined}
              >
                <field.SelectField<number>
                  options={serviceOptions}
                  className="w-full"
                  disabled={isEdit}
                  placeholder="请选择…"
                />
              </field.FormField>
            )}
          </form.AppField>
          <form.AppField name="key">
            {(field) => (
              <field.FormField label="模型 ID" description="服务商提供的模型标识，例如 gpt-4o-mini">
                <field.InputField placeholder="gpt-4o-mini" autoFocus={!isEdit} />
              </field.FormField>
            )}
          </form.AppField>
          <form.AppField name="name">
            {(field) => (
              <field.FormField label="显示名" description="可与模型 ID 不同">
                <field.InputField placeholder="例如：GPT-4o mini" />
              </field.FormField>
            )}
          </form.AppField>
          <form.AppField name="description">
            {(field) => (
              <field.FormField label="备注" description="可选">
                <field.TextareaField
                  className="h-20 min-h-20 w-full resize-none"
                  placeholder="可选，简要说明用途"
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
