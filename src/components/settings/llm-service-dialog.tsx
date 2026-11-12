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
import { t } from "@/i18n";
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
        title: isEdit ? t("Update failed") : t("Failed to add"),
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
        title: t("Connection successful"),
        description: t("Latency {0} ms · {1} models", res.latencyMs, res.count),
      }),
    onError: (err) =>
      toast.error({
        title: t("Connection failed"),
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
      title={isEdit ? t("Edit LLM service") : t("Add LLM service")}
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
                {testing ? t("Testing…") : t("Test connection")}
              </Button>
            )}
          </form.Subscribe>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={busy}>
            {t("Cancel")}
          </Button>
          <Button disabled={busy} onClick={() => form.handleSubmit()}>
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
                <field.InputField placeholder={t("Example: Main OpenAI service")} autoFocus />
              </field.FormField>
            )}
          </form.AppField>
          <form.AppField name="type">
            {(field) => (
              <field.FormField label={t("Type")}>
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
                  <field.FormField label={t("Base URL")}>
                    <field.InputField placeholder={DEFAULT_LLM_BASE_URLS[type]} />
                  </field.FormField>
                )}
              </form.AppField>
            )}
          </form.Subscribe>
          <form.AppField name="apiKey">
            {(field) => (
              <field.FormField
                label={t("API key")}
                description={
                  isEdit
                    ? t("Leave blank to keep the current API key, or enter a replacement")
                    : t("Optional for local Ollama deployments")
                }
              >
                <field.PasswordField
                  placeholder={isEdit ? t("Leave blank to keep current value") : t("Optional")}
                />
              </field.FormField>
            )}
          </form.AppField>
          <form.AppField name="settings.maxOutputTokens">
            {(field) => (
              <field.FormField
                label={t("Output token limit")}
                description={t(
                  "Optional. Smart formatting estimates tokens from the text length. Set the model’s output limit (e.g. 8K for DeepSeek or Anthropic, 65K for Gemini) to cap the estimate and prevent errors.",
                )}
              >
                <field.NumberField
                  min={1}
                  step={1024}
                  integer
                  clearable
                  placeholder={t("Leave blank for no cap")}
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
