import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import type { SelectOption } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import {
  createTTSService,
  createTTSServiceSchema,
  type TTSServiceListItem,
  updateTTSService,
} from "@/lib/tts-services.functions";
import { TTSServiceType, type TTSSettings } from "@/types/tts";

// `responseFormat` is a virtual form field — it is folded back into
// `settings.responseFormat` on submit. Extending the validator schema lets
// TanStack Form line up its types with the form's defaultValues.
const formSchema = createTTSServiceSchema.extend({
  responseFormat: z.string().nullable().optional(),
});

type TTSFormValues = z.input<typeof formSchema>;

const TYPE_OPTIONS: SelectOption<TTSServiceType>[] = [
  { value: TTSServiceType.OpenTTS, label: "Open TTS" },
  { value: TTSServiceType.OpenAITTS, label: "OpenAI TTS 兼容" },
];

// OpenAI-compatible TTS endpoints accept these as `response_format`.
const RESPONSE_FORMAT_OPTIONS: SelectOption<string>[] = [
  { value: "mp3", label: "mp3" },
  { value: "opus", label: "opus" },
  { value: "aac", label: "aac" },
  { value: "flac", label: "flac" },
  { value: "wav", label: "wav" },
  { value: "pcm", label: "pcm" },
];

const EMPTY: TTSFormValues = {
  name: "",
  type: TTSServiceType.OpenTTS,
  baseUrl: "",
  previewBaseUrl: "",
  bearerToken: "",
  settings: null,
  responseFormat: null,
};

function toFormValues(service: TTSServiceListItem | null): TTSFormValues {
  if (!service) return EMPTY;
  return {
    name: service.name,
    type: service.type,
    baseUrl: service.baseUrl,
    previewBaseUrl: service.previewBaseUrl ?? "",
    bearerToken: "",
    settings: null,
    responseFormat: service.settings?.responseFormat ?? null,
  };
}

// Merge the form-controlled fields back into the service's existing settings
// JSON, preserving keys we don't surface in the dialog (model / timeout / …).
// Returns null when the resulting object would be empty so we don't store
// `{}` rows.
function buildSettings(
  base: TTSSettings | null | undefined,
  responseFormat: string | null,
): TTSSettings | null {
  const next: Record<string, unknown> = { ...(base ?? {}) };
  const trimmed = responseFormat?.trim();
  if (trimmed) {
    next.responseFormat = trimmed;
  } else {
    delete next.responseFormat;
  }
  return Object.keys(next).length > 0 ? (next as TTSSettings) : null;
}

export default function TTSServiceDialog({
  open,
  onOpenChange,
  service,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service: TTSServiceListItem | null;
}) {
  const isEdit = !!service;
  const qc = useQueryClient();
  const create = useServerFn(createTTSService);
  const update = useServerFn(updateTTSService);

  const submitMutation = useMutation({
    mutationFn: (input: z.input<typeof createTTSServiceSchema>) =>
      service ? update({ data: { ...input, id: service.id } }) : create({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tts-services"] });
      handleOpenChange(false);
    },
    onError: (err) =>
      toast.error({
        title: isEdit ? "更新失败" : "添加失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const form = useAppForm({
    defaultValues: toFormValues(service),
    validators: { onSubmit: formSchema },
    onSubmit: ({ value }) => {
      const { responseFormat, settings: _ignored, ...rest } = value;
      submitMutation.mutate({
        ...rest,
        settings: buildSettings(service?.settings ?? null, responseFormat ?? null),
      });
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
  const submitLabel = submitting
    ? isEdit
      ? "保存中…"
      : form.getFieldValue("type") === TTSServiceType.OpenTTS
        ? "连接中…"
        : "添加中…"
    : isEdit
      ? "保存"
      : "添加";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) handleOpenChange(next);
      }}
      title={isEdit ? "编辑 TTS 服务" : "添加 TTS 服务"}
      description={
        !isEdit
          ? "Open TTS 类型的服务在添加时会请求 /healthz 拉取 capabilities，失败将无法添加"
          : undefined
      }
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button disabled={submitting} onClick={() => form.handleSubmit()}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form.AppForm>
        <div className="flex flex-col gap-4">
          <form.AppField name="name">
            {(field) => (
              <field.FormField label="名称">
                <field.InputField placeholder="例如：本地 OpenTTS" autoFocus />
              </field.FormField>
            )}
          </form.AppField>
          <form.AppField name="type">
            {(field) => (
              <field.FormField label="类型">
                <field.SelectField options={TYPE_OPTIONS} disabled={isEdit} />
              </field.FormField>
            )}
          </form.AppField>
          <form.AppField name="baseUrl">
            {(field) => (
              <field.FormField label="Base URL">
                <field.InputField
                  placeholder={
                    form.getFieldValue("type") === TTSServiceType.OpenTTS
                      ? "http://localhost:8000"
                      : "https://api.openai.com/v1"
                  }
                />
              </field.FormField>
            )}
          </form.AppField>
          <form.AppField name="previewBaseUrl">
            {(field) => (
              <field.FormField
                label="试听 Base URL"
                description="可选；声音试听音频为相对路径时使用此地址拼接，留空则使用 Base URL"
              >
                <field.InputField placeholder="留空则使用 Base URL" />
              </field.FormField>
            )}
          </form.AppField>
          <form.AppField name="bearerToken">
            {(field) => (
              <field.FormField
                label="Bearer Token"
                description={
                  isEdit ? "留空则保留原 Token，输入则覆盖更新" : "可选；部署启用了鉴权时填写"
                }
              >
                <field.PasswordField placeholder={isEdit ? "留空保持不变" : "可选"} />
              </field.FormField>
            )}
          </form.AppField>
          <form.AppField name="responseFormat">
            {(field) => (
              <field.FormField label="音频格式" description="可选；不选则使用 TTS 服务的默认格式">
                <field.SelectField
                  options={RESPONSE_FORMAT_OPTIONS}
                  className="w-full"
                  clearable
                  placeholder="使用服务默认格式"
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
