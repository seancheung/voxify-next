import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import type z from "zod";
import { useAppForm } from "@/components/form";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import type { SelectOption } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { t } from "@/i18n";
import { listTTSServices } from "@/lib/tts-services.functions";
import {
  createVoice,
  createVoiceSchema,
  updateVoice,
  updateVoiceSchema,
  type VoiceListItem,
} from "@/lib/voices.functions";
import { TTSServiceType } from "@/types/tts";

type CreateVoiceInput = z.input<typeof createVoiceSchema>;
type UpdateVoiceInput = z.input<typeof updateVoiceSchema>;

const EMPTY: CreateVoiceInput = {
  ttsServiceId: 0,
  key: "",
  name: "",
};

export default function VoiceDialog({
  open,
  onOpenChange,
  voice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voice: VoiceListItem | null;
}) {
  const isEdit = !!voice;
  const qc = useQueryClient();
  const create = useServerFn(createVoice);
  const update = useServerFn(updateVoice);
  const fetchServices = useServerFn(listTTSServices);

  const { data: services = [] } = useQuery({
    queryKey: ["tts-services"],
    queryFn: () => fetchServices(),
    enabled: open && !isEdit,
  });

  const serviceOptions: SelectOption<number>[] = services
    .filter((s) => s.type === TTSServiceType.OpenAITTS && s.enabled)
    .map((s) => ({ value: s.id, label: s.name }));

  const submitMutation = useMutation<unknown, Error, CreateVoiceInput | UpdateVoiceInput>({
    mutationFn: (input) =>
      voice
        ? update({ data: input as UpdateVoiceInput })
        : create({ data: input as CreateVoiceInput }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voices"] });
      handleOpenChange(false);
    },
    onError: (err) =>
      toast.error({
        title: isEdit ? t("Update failed") : t("Creation failed"),
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const createForm = useAppForm({
    defaultValues: EMPTY,
    validators: { onSubmit: createVoiceSchema },
    onSubmit: ({ value }) => submitMutation.mutate(value),
  });

  const editForm = useAppForm({
    defaultValues: {
      id: voice?.id ?? 0,
      key: voice?.key ?? "",
      name: voice?.name ?? "",
    } as UpdateVoiceInput,
    validators: { onSubmit: updateVoiceSchema },
    onSubmit: ({ value }) => submitMutation.mutate(value),
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: only sync when the dialog opens or the target voice changes
  useEffect(() => {
    if (open) {
      if (voice) {
        editForm.reset({
          id: voice.id,
          key: voice.key,
          name: voice.name,
        });
      } else {
        createForm.reset(EMPTY);
      }
      submitMutation.reset();
    }
  }, [open, voice]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      createForm.reset(EMPTY);
      submitMutation.reset();
    }
    onOpenChange(next);
  }

  const submitting = submitMutation.isPending;
  const submitLabel = submitting
    ? isEdit
      ? t("Saving…")
      : t("Creating…")
    : isEdit
      ? t("Save")
      : t("Create");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) handleOpenChange(next);
      }}
      title={isEdit ? t("Edit voice") : t("New voice")}
      description={
        isEdit
          ? undefined
          : t("New voices are supported for OpenAI TTS services. The name defaults to the key.")
      }
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={submitting}>
            {t("Cancel")}
          </Button>
          <Button
            disabled={submitting || (!isEdit && serviceOptions.length === 0)}
            onClick={() => (isEdit ? editForm.handleSubmit() : createForm.handleSubmit())}
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      {isEdit ? (
        <editForm.AppForm>
          <div className="flex flex-col gap-4">
            <editForm.AppField name="key">
              {(field) => (
                <field.FormField label={t("Voice key")}>
                  <field.InputField placeholder={t("Example: alloy")} autoFocus />
                </field.FormField>
              )}
            </editForm.AppField>
            <editForm.AppField name="name">
              {(field) => (
                <field.FormField label={t("Name")} description={t("Leave blank to use the key")}>
                  <field.InputField placeholder={t("Optional")} />
                </field.FormField>
              )}
            </editForm.AppField>
            {submitMutation.isError && (
              <editForm.FormError>{submitMutation.error.message}</editForm.FormError>
            )}
          </div>
        </editForm.AppForm>
      ) : (
        <createForm.AppForm>
          <div className="flex flex-col gap-4">
            <createForm.AppField name="ttsServiceId">
              {(field) => (
                <field.FormField label={t("TTS services")}>
                  <field.SelectField<number>
                    options={serviceOptions}
                    placeholder={
                      serviceOptions.length === 0
                        ? t("No available OpenAI TTS services")
                        : t("Select…")
                    }
                    disabled={serviceOptions.length === 0}
                  />
                </field.FormField>
              )}
            </createForm.AppField>
            <createForm.AppField name="key">
              {(field) => (
                <field.FormField label={t("Voice key")}>
                  <field.InputField placeholder={t("Example: alloy")} />
                </field.FormField>
              )}
            </createForm.AppField>
            <createForm.AppField name="name">
              {(field) => (
                <field.FormField label={t("Name")} description={t("Leave blank to use the key")}>
                  <field.InputField placeholder={t("Optional")} />
                </field.FormField>
              )}
            </createForm.AppField>
            {submitMutation.isError && (
              <createForm.FormError>{submitMutation.error.message}</createForm.FormError>
            )}
          </div>
        </createForm.AppForm>
      )}
    </Dialog>
  );
}
