import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { useAppForm } from "@/components/form";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import type { SelectOption } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { t } from "@/i18n";
import { listTTSServices } from "@/lib/tts-services.functions";
import { createVoiceDesign, createVoiceDesignSchema } from "@/lib/voice-designs.functions";

export type VoiceDesignDialogPrefill = {
  ttsServiceId: number;
  name: string;
  instruct: string;
  input: string;
};

const EMPTY: VoiceDesignDialogPrefill = {
  ttsServiceId: 0,
  name: "",
  instruct: "",
  input: "",
};

export default function VoiceDesignDialog({
  open,
  onOpenChange,
  prefill,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: VoiceDesignDialogPrefill | null;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createVoiceDesign);
  const fetchServices = useServerFn(listTTSServices);

  const { data: services = [] } = useQuery({
    queryKey: ["tts-services"],
    queryFn: () => fetchServices(),
    enabled: open,
  });

  const serviceOptions: SelectOption<number>[] = services
    .filter((s) => s.enabled && s.capabilities?.design)
    .map((s) => ({ value: s.id, label: s.name }));

  const submitMutation = useMutation({
    mutationFn: (input: VoiceDesignDialogPrefill) => create({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voice-designs"] });
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error({
        title: t("Submission failed"),
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  // TanStack Form only honors `defaultValues` on mount, so remount the inner
  // form whenever the dialog opens — that's how the latest prefill becomes
  // the initial values without a fragile `form.reset` race.
  const [sessionKey, setSessionKey] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only the open transition should bump the session key
  useEffect(() => {
    if (open) {
      setSessionKey((k) => k + 1);
      submitMutation.reset();
    }
  }, [open]);

  const submitRef = useRef<(() => void) | null>(null);
  const submitting = submitMutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) onOpenChange(next);
      }}
      title={t("Design voice")}
      description={t("Describe a voice and generate a sample recording.")}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("Cancel")}
          </Button>
          <Button
            disabled={submitting || serviceOptions.length === 0}
            onClick={() => submitRef.current?.()}
          >
            {submitting ? t("Submitting…") : t("Start generation")}
          </Button>
        </>
      }
    >
      <VoiceDesignDialogForm
        key={sessionKey}
        defaults={prefill ?? EMPTY}
        serviceOptions={serviceOptions}
        submitRef={submitRef}
        onSubmit={(values) => submitMutation.mutate(values)}
        errorMessage={submitMutation.isError ? submitMutation.error.message : null}
      />
    </Dialog>
  );
}

function VoiceDesignDialogForm({
  defaults,
  serviceOptions,
  submitRef,
  onSubmit,
  errorMessage,
}: {
  defaults: VoiceDesignDialogPrefill;
  serviceOptions: SelectOption<number>[];
  submitRef: React.MutableRefObject<(() => void) | null>;
  onSubmit: (values: VoiceDesignDialogPrefill) => void;
  errorMessage: string | null;
}) {
  const form = useAppForm({
    defaultValues: defaults,
    validators: { onSubmit: createVoiceDesignSchema },
    onSubmit: ({ value }) => onSubmit(value),
  });

  submitRef.current = () => form.handleSubmit();

  return (
    <form.AppForm>
      <div className="flex flex-col gap-4">
        <form.AppField name="ttsServiceId">
          {(field) => (
            <field.FormField label={t("TTS services")}>
              <field.SelectField<number>
                options={serviceOptions}
                placeholder={
                  serviceOptions.length === 0 ? t("No services support voice design") : t("Select…")
                }
                disabled={serviceOptions.length === 0}
              />
            </field.FormField>
          )}
        </form.AppField>
        <form.AppField name="name">
          {(field) => (
            <field.FormField label={t("Name")}>
              <field.InputField placeholder={t("Give this voice a name")} autoFocus />
            </field.FormField>
          )}
        </form.AppField>
        <form.AppField name="instruct">
          {(field) => (
            <field.FormField
              label={t("Voice description")}
              description={t("Example: female, British accent, warm tone")}
            >
              <field.TextareaField rows={3} placeholder={t("Describe the voice…")} />
            </field.FormField>
          )}
        </form.AppField>
        <form.AppField name="input">
          {(field) => (
            <field.FormField label={t("Sample text")}>
              <field.TextareaField rows={4} placeholder={t("Text to synthesize for the preview")} />
            </field.FormField>
          )}
        </form.AppField>
        {errorMessage && <form.FormError>{errorMessage}</form.FormError>}
      </div>
    </form.AppForm>
  );
}
