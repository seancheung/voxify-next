import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import type z from "zod";
import { useAppForm } from "@/components/form";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import type { SelectOption } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
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
        title: isEdit ? "更新失败" : "创建失败",
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
  const submitLabel = submitting ? (isEdit ? "保存中…" : "创建中…") : isEdit ? "保存" : "创建";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) handleOpenChange(next);
      }}
      title={isEdit ? "编辑声音" : "新建声音"}
      description={
        isEdit ? undefined : "仅支持为 OpenAI TTS 类型的服务新建声音；name 缺省时与 key 相同"
      }
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={submitting}>
            取消
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
                <field.FormField label="声音 key">
                  <field.InputField placeholder="例如：alloy" autoFocus />
                </field.FormField>
              )}
            </editForm.AppField>
            <editForm.AppField name="name">
              {(field) => (
                <field.FormField label="名称" description="留空则与 key 相同">
                  <field.InputField placeholder="可选" />
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
                <field.FormField label="TTS 服务">
                  <field.SelectField<number>
                    options={serviceOptions}
                    placeholder={
                      serviceOptions.length === 0 ? "暂无可用的 OpenAI TTS 服务" : "请选择…"
                    }
                    disabled={serviceOptions.length === 0}
                  />
                </field.FormField>
              )}
            </createForm.AppField>
            <createForm.AppField name="key">
              {(field) => (
                <field.FormField label="声音 key">
                  <field.InputField placeholder="例如：alloy" />
                </field.FormField>
              )}
            </createForm.AppField>
            <createForm.AppField name="name">
              {(field) => (
                <field.FormField label="名称" description="留空则与 key 相同">
                  <field.InputField placeholder="可选" />
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
