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
        title: "保存失败",
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
      title="全局默认值"
      description="新建项目和段落时使用的默认配置，可在项目内单独覆盖"
      actions={
        <Button variant="ghost" onClick={() => setResetOpen(true)} disabled={save.isPending}>
          重置为默认值
        </Button>
      }
    >
      <form.AppForm>
        <form.AutoSubmit onSubmit={() => form.handleSubmit()} debounceMs={400}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <form.AppField name="defaultLlmModelId">
              {(field) => (
                <field.FormField label="默认 LLM 模型">
                  <field.ComboboxField options={llmOptions} className="w-full" clearable />
                </field.FormField>
              )}
            </form.AppField>
            <form.AppField name="defaultPromptId">
              {(field) => (
                <field.FormField label="默认提示词">
                  <field.SelectField options={promptOptions} className="w-full" clearable />
                </field.FormField>
              )}
            </form.AppField>
            <form.AppField name="defaultTtsTimeoutMs">
              {(field) => (
                <field.FormField
                  label="TTS 请求超时"
                  description="单次合成请求最长等待时间（毫秒）"
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
                  label="LLM 请求超时"
                  description="单次推理请求最长等待时间（毫秒）"
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
                <field.FormField label="段落默认间隔" description="毫秒，0 表示不插入静音">
                  <field.NumberField min={0} max={60_000} step={50} integer className="w-full" />
                </field.FormField>
              )}
            </form.AppField>
            <form.AppField name="defaultChapterGapMs">
              {(field) => (
                <field.FormField
                  label="章节间隔"
                  description="毫秒，多章节合并导出时章节之间插入的静音"
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
        title="重置全局默认值？"
        description="当前全局设置将恢复为应用的初始默认值。"
        footer={
          <>
            <Button variant="ghost" disabled={save.isPending} onClick={() => setResetOpen(false)}>
              取消
            </Button>
            <Button
              disabled={save.isPending}
              onClick={() =>
                save.mutate(DEFAULT_APP_CONFIG, { onSuccess: () => setResetOpen(false) })
              }
            >
              {save.isPending ? "保存中…" : "确认重置"}
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
