import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import type { SelectOption } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { t } from "@/i18n";
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
  {
    value: TTSServiceType.OpenAITTS,
    get label() {
      return t("OpenAI TTS compatible");
    },
  },
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
        title: isEdit ? t("Update failed") : t("Failed to add"),
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
      ? t("Saving…")
      : form.getFieldValue("type") === TTSServiceType.OpenTTS
        ? t("Connecting…")
        : t("Adding…")
    : isEdit
      ? t("Save")
      : t("Add");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) handleOpenChange(next);
      }}
      title={isEdit ? t("Edit TTS service") : t("Add TTS service")}
      description={
        !isEdit
          ? t("Open TTS services must return capabilities from /healthz before they can be added.")
          : undefined
      }
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={submitting}>
            {t("Cancel")}
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
              <field.FormField label={t("Name")}>
                <field.InputField placeholder={t("Example: Local OpenTTS")} autoFocus />
              </field.FormField>
            )}
          </form.AppField>
          <form.AppField name="type">
            {(field) => (
              <field.FormField label={t("Type")}>
                <field.SelectField options={TYPE_OPTIONS} disabled={isEdit} />
              </field.FormField>
            )}
          </form.AppField>
          <form.AppField name="baseUrl">
            {(field) => (
              <field.FormField label={t("Base URL")}>
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
                label={t("Preview base URL")}
                description={t(
                  "Optional base URL for relative voice preview paths. Defaults to the service base URL.",
                )}
              >
                <field.InputField placeholder={t("Leave blank to use the base URL")} />
              </field.FormField>
            )}
          </form.AppField>
          <form.AppField name="bearerToken">
            {(field) => (
              <field.FormField
                label={t("Bearer token")}
                description={
                  isEdit
                    ? t("Leave blank to keep the current token, or enter a replacement")
                    : t("Optional. Enter a token if authentication is enabled.")
                }
              >
                <field.PasswordField
                  placeholder={isEdit ? t("Leave blank to keep current value") : t("Optional")}
                />
              </field.FormField>
            )}
          </form.AppField>
          <form.AppField name="responseFormat">
            {(field) => (
              <field.FormField
                label={t("Audio format")}
                description={t("Optional. Defaults to the TTS service format.")}
              >
                <field.SelectField
                  options={RESPONSE_FORMAT_OPTIONS}
                  className="w-full"
                  clearable
                  placeholder={t("Use service default format")}
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
