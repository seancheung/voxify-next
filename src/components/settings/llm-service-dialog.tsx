import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PlugIcon } from "lucide-react";
import { useEffect } from "react";
import type z from "zod";
import { useAppForm } from "@/components/form";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import type { SelectOption } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import {
  createLLMService,
  createLLMServiceSchema,
  DEFAULT_LLM_BASE_URLS,
  type LLMServiceListItem,
  pingLLMService,
  updateLLMService,
} from "@/lib/llm-services.functions";
import { LLMType } from "@/types/llm";

type LLMFormValues = z.input<typeof createLLMServiceSchema>;

const TYPE_OPTIONS: SelectOption<LLMType>[] = [
  { value: LLMType.OpenAI, label: "OpenAI" },
  { value: LLMType.Anthropic, label: "Anthropic" },
  { value: LLMType.GoogleGenerativeAI, label: "Google Generative AI" },
  { value: LLMType.Ollama, label: "Ollama" },
  { value: LLMType.DeepSeek, label: "DeepSeek" },
];

const EMPTY: LLMFormValues = {
  name: "",
  type: LLMType.OpenAI,
  baseUrl: DEFAULT_LLM_BASE_URLS[LLMType.OpenAI],
  apiKey: "",
  settings: { maxOutputTokens: null },
};

function toFormValues(service: LLMServiceListItem | null): LLMFormValues {
  if (!service) return EMPTY;
  return {
    name: service.name,
    type: service.type,
    baseUrl: service.baseUrl,
    apiKey: "",
    settings: {
      temperature: service.settings?.temperature ?? null,
      maxOutputTokens: service.settings?.maxOutputTokens ?? null,
    },
  };
}

export default function LLMServiceDialog({
  open,
  onOpenChange,
  service,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service: LLMServiceListItem | null;
}) {
  const isEdit = !!service;
  const qc = useQueryClient();
  const create = useServerFn(createLLMService);
  const update = useServerFn(updateLLMService);

  const submitMutation = useMutation({
    mutationFn: (input: LLMFormValues) =>
      service ? update({ data: { ...input, id: service.id } }) : create({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["llm-services"] });
      handleOpenChange(false);
    },
    onError: (err) =>
      toast.error({
        title: isEdit ? "更新失败" : "添加失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const ping = useServerFn(pingLLMService);
  const testMutation = useMutation({
    mutationFn: (input: LLMFormValues) =>
      ping({
        data: {
          id: service?.id,
          type: input.type,
          baseUrl: input.baseUrl,
          apiKey: input.apiKey,
        },
      }),
    onSuccess: (res) =>
      toast.success({
        title: "连接成功",
        description: `延迟 ${res.latencyMs} ms · 共 ${res.count} 个模型`,
      }),
    onError: (err) =>
      toast.error({
        title: "连接失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const form = useAppForm({
    defaultValues: toFormValues(service),
    validators: { onSubmit: createLLMServiceSchema },
    onSubmit: ({ value }) => {
      submitMutation.mutate(value);
    },
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: only sync when the dialog opens or the target service changes
  useEffect(() => {
    if (open) {
      form.reset(toFormValues(service));
      submitMutation.reset();
    }
  }, [open, service]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      form.reset(EMPTY);
      submitMutation.reset();
    }
    onOpenChange(next);
  }

  const submitting = submitMutation.isPending;
  const testing = testMutation.isPending;
  const busy = submitting || testing;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) handleOpenChange(next);
      }}
      title={isEdit ? "编辑 LLM 服务" : "添加 LLM 服务"}
      size="md"
      footer={
        <>
          <form.Subscribe selector={(s) => s.values}>
            {(values) => (
              <Button
                variant="secondary"
                className="mr-auto"
                disabled={busy}
                onClick={async () => {
                  const errors = await form.validate("submit");
                  if (Object.keys(errors).length > 0) return;
                  testMutation.mutate(values);
                }}
              >
                <PlugIcon />
                {testing ? "测试中…" : "测试连接"}
              </Button>
            )}
          </form.Subscribe>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button disabled={busy} onClick={() => form.handleSubmit()}>
            {submitting ? "保存中…" : isEdit ? "保存" : "添加"}
          </Button>
        </>
      }
    >
      <form.AppForm>
        <div className="flex flex-col gap-4">
          <form.AppField name="name">
            {(field) => (
              <field.FormField label="名称">
                <field.InputField placeholder="例如：OpenAI 主力" autoFocus />
              </field.FormField>
            )}
          </form.AppField>
          <form.AppField name="type">
            {(field) => (
              <field.FormField label="类型">
                <field.SelectField<LLMType>
                  options={TYPE_OPTIONS}
                  disabled={isEdit}
                  onChange={(next) => {
                    field.handleChange(next);
                    const current = form.getFieldValue("baseUrl") as string;
                    const wasDefault =
                      !current || Object.values(DEFAULT_LLM_BASE_URLS).includes(current);
                    if (wasDefault) {
                      form.setFieldValue("baseUrl", DEFAULT_LLM_BASE_URLS[next]);
                    }
                  }}
                />
              </field.FormField>
            )}
          </form.AppField>
          <form.Subscribe selector={(s) => s.values.type as LLMType}>
            {(type) => (
              <form.AppField name="baseUrl">
                {(field) => (
                  <field.FormField label="Base URL">
                    <field.InputField placeholder={DEFAULT_LLM_BASE_URLS[type]} />
                  </field.FormField>
                )}
              </form.AppField>
            )}
          </form.Subscribe>
          <form.AppField name="apiKey">
            {(field) => (
              <field.FormField
                label="API Key"
                description={
                  isEdit
                    ? "留空则保留原 API Key，输入则覆盖更新"
                    : "可选；本地部署的 Ollama 通常无需填写"
                }
              >
                <field.PasswordField placeholder={isEdit ? "留空保持不变" : "可选"} />
              </field.FormField>
            )}
          </form.AppField>
          <form.AppField name="settings.maxOutputTokens">
            {(field) => (
              <field.FormField
                label="输出 Token 上限"
                description="可选。智能格式化等任务会按文本长度自动估算所需 token 数；如果该服务的模型有较小的输出上限（例如 DeepSeek 8K、Anthropic 默认 8K、Gemini 65K），在这里填上限值，自动估算时会以此封顶以避免超限报错。留空表示不封顶。"
              >
                <field.NumberField
                  min={1}
                  step={1024}
                  integer
                  clearable
                  placeholder="留空表示不封顶"
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
