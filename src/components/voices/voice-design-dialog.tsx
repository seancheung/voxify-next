import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { useAppForm } from "@/components/form";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import type { SelectOption } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
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
        title: "提交失败",
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
      title="设计声音"
      description="使用自然语言描述生成新的声音，并合成一段示例音频。"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button
            disabled={submitting || serviceOptions.length === 0}
            onClick={() => submitRef.current?.()}
          >
            {submitting ? "提交中…" : "开始生成"}
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
            <field.FormField label="TTS 服务">
              <field.SelectField<number>
                options={serviceOptions}
                placeholder={serviceOptions.length === 0 ? "暂无支持声音设计的服务" : "请选择…"}
                disabled={serviceOptions.length === 0}
              />
            </field.FormField>
          )}
        </form.AppField>
        <form.AppField name="name">
          {(field) => (
            <field.FormField label="名称">
              <field.InputField placeholder="给这个声音起个名字" autoFocus />
            </field.FormField>
          )}
        </form.AppField>
        <form.AppField name="instruct">
          {(field) => (
            <field.FormField label="声音描述" description="例如：female, british accent, warm tone">
              <field.TextareaField rows={3} placeholder="描述想要的声音…" />
            </field.FormField>
          )}
        </form.AppField>
        <form.AppField name="input">
          {(field) => (
            <field.FormField label="合成文本">
              <field.TextareaField rows={4} placeholder="将用于示例音频的文本" />
            </field.FormField>
          )}
        </form.AppField>
        {errorMessage && <form.FormError>{errorMessage}</form.FormError>}
      </div>
    </form.AppForm>
  );
}
