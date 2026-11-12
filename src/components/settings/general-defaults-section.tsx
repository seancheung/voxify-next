import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { useAppForm } from "@/components/form";
import SectionCard from "@/components/settings/section-card";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import type { SelectOption } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { t } from "@/i18n";
import {
  appConfigSchema,
  DEFAULT_APP_CONFIG,
  getAppConfig,
  updateAppConfig,
} from "@/lib/configs.functions";
import { listLLMModels } from "@/lib/llm-models.functions";
import { listPrompts } from "@/lib/prompts.functions";

export default function GeneralDefaultsSection() {
  const [resetOpen, setResetOpen] = useState(false);
  const fetchConfig = useServerFn(getAppConfig);
  const saveConfig = useServerFn(updateAppConfig);
  const fetchLLM = useServerFn(listLLMModels);
  const fetchPrompts = useServerFn(listPrompts);

  const qc = useQueryClient();

  const [{ data: config }, { data: llmList = [] }, { data: promptList = [] }] = useQueries({
    queries: [
      { queryKey: ["app-config"], queryFn: () => fetchConfig() },
      { queryKey: ["llm-models"], queryFn: () => fetchLLM() },
      { queryKey: ["prompts"], queryFn: () => fetchPrompts() },
    ],
  });

  const save = useMutation({
    mutationFn: (next: z.input<typeof appConfigSchema>) => saveConfig({ data: next }),
    onSuccess: (saved) => {
      qc.setQueryData(["app-config"], saved);
    },
    onError: (err) =>
      toast.error({
        title: t("Save failed"),
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const form = useAppForm({
    // Cast to the schema's input type (every field optional) so the form's
    // value type lines up with `validators.onSubmit: appConfigSchema`. The
    // server function applies defaults during parse, so submitting a partial
    // payload is fine.
    defaultValues: (config ?? DEFAULT_APP_CONFIG) as z.input<typeof appConfigSchema>,
    validators: { onSubmit: appConfigSchema },
    onSubmit: ({ value }) => save.mutate(value),
  });

  useEffect(() => {
    if (config) form.reset(config);
  }, [config, form]);

  const llmOptions: SelectOption<number | null>[] = llmList
    .filter((m) => m.enabled)
    .map((m) => ({ value: m.id, label: `${m.llmServiceName} · ${m.name}` }));
  const promptOptions = makeServiceOptions(promptList);

  return (
    <SectionCard
      title={t("Global defaults")}
      description={t(
        "Default settings for new projects and segments. Override them in individual projects.",
      )}
      actions={
        <Button variant="ghost" onClick={() => setResetOpen(true)} disabled={save.isPending}>
          {t("Reset to defaults")}
        </Button>
      }
    >
      <form.AppForm>
        <form.AutoSubmit onSubmit={() => form.handleSubmit()} debounceMs={400}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <form.AppField name="defaultLlmModelId">
              {(field) => (
                <field.FormField label={t("Default LLM model")}>
                  <field.ComboboxField options={llmOptions} className="w-full" clearable />
                </field.FormField>
              )}
            </form.AppField>
            <form.AppField name="defaultPromptId">
              {(field) => (
                <field.FormField label={t("Default prompt")}>
                  <field.SelectField options={promptOptions} className="w-full" clearable />
                </field.FormField>
              )}
            </form.AppField>
            <form.AppField name="defaultTtsTimeoutMs">
              {(field) => (
                <field.FormField
                  label={t("TTS request timeout")}
                  description={t("Maximum time for one synthesis request (milliseconds)")}
                >
                  <field.NumberField
                    min={1000}
                    max={600_000}
                    step={1000}
                    integer
                    className="w-full"
                  />
                </field.FormField>
              )}
            </form.AppField>
            <form.AppField name="defaultLlmTimeoutMs">
              {(field) => (
                <field.FormField
                  label={t("LLM request timeout")}
                  description={t("Maximum time for one inference request (milliseconds)")}
                >
                  <field.NumberField
                    min={1000}
                    max={600_000}
                    step={1000}
                    integer
                    className="w-full"
                  />
                </field.FormField>
              )}
            </form.AppField>
            <form.AppField name="defaultSegmentGapMs">
              {(field) => (
                <field.FormField
                  label={t("Default segment gap")}
                  description={t("Milliseconds. Set to 0 for no silence.")}
                >
                  <field.NumberField min={0} max={60_000} step={50} integer className="w-full" />
                </field.FormField>
              )}
            </form.AppField>
            <form.AppField name="defaultChapterGapMs">
              {(field) => (
                <field.FormField
                  label={t("Chapter gap")}
                  description={t("Silence between chapters in a merged export, in milliseconds")}
                >
                  <field.NumberField min={0} max={600_000} step={100} integer className="w-full" />
                </field.FormField>
              )}
            </form.AppField>
          </div>
        </form.AutoSubmit>
      </form.AppForm>
      <Dialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        closable={!save.isPending}
        size="sm"
        title={t("Reset global defaults?")}
        description={t("Restore the original application defaults.")}
        footer={
          <>
            <Button variant="ghost" disabled={save.isPending} onClick={() => setResetOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button
              disabled={save.isPending}
              onClick={() =>
                save.mutate(DEFAULT_APP_CONFIG, { onSuccess: () => setResetOpen(false) })
              }
            >
              {save.isPending ? t("Saving…") : t("Confirm reset")}
            </Button>
          </>
        }
      />
    </SectionCard>
  );
}

function makeServiceOptions(
  items: ReadonlyArray<{ id: number; name: string; enabled: boolean | null }>,
): SelectOption<number | null>[] {
  return [...items.filter((s) => s.enabled).map((s) => ({ value: s.id, label: s.name }))];
}
