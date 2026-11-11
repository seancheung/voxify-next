import { useQueries } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import type { SelectOption } from "@/components/ui/select";
import { getProject } from "@/lib/chapters.functions";
import { getAppConfig } from "@/lib/configs.functions";
import { listLLMModels } from "@/lib/llm-models.functions";
import { listPrompts } from "@/lib/prompts.functions";

const schema = z.object({
  llmModelId: z.number({ error: "请选择 LLM 模型" }).int().positive("请选择 LLM 模型"),
  promptId: z.number({ error: "请选择提示词" }).int().positive("请选择提示词"),
});

type SmartFormatPayload = z.infer<typeof schema>;

export default function SmartFormatDialog({
  open,
  onOpenChange,
  projectId,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  onConfirm: (payload: SmartFormatPayload) => void;
}) {
  const fetchLLM = useServerFn(listLLMModels);
  const fetchPrompts = useServerFn(listPrompts);
  const fetchConfig = useServerFn(getAppConfig);
  const fetchProject = useServerFn(getProject);

  const [{ data: llmList = [] }, { data: promptList = [] }, { data: config }, { data: project }] =
    useQueries({
      queries: [
        {
          queryKey: ["llm-models"],
          queryFn: () => fetchLLM(),
          enabled: open,
        },
        {
          queryKey: ["prompts"],
          queryFn: () => fetchPrompts(),
          enabled: open,
        },
        {
          queryKey: ["app-config"],
          queryFn: () => fetchConfig(),
          enabled: open,
        },
        {
          queryKey: ["project", projectId],
          queryFn: () => fetchProject({ data: { id: projectId } }),
          enabled: open,
        },
      ],
    });

  const llmOptions: SelectOption<number>[] = llmList
    .filter((m) => m.enabled)
    .map((m) => ({
      value: m.id,
      label: `${m.llmServiceName} · ${m.name}`,
    }));
  const promptOptions: SelectOption<number>[] = promptList
    .filter((p) => p.enabled)
    .map((p) => ({ value: p.id, label: p.name }));

  const initialLlm = project?.llmModelId ?? config?.defaultLlmModelId ?? null;
  const initialPrompt = project?.promptId ?? config?.defaultPromptId ?? null;

  const form = useAppForm({
    defaultValues: {
      llmModelId: initialLlm as number | null,
      promptId: initialPrompt as number | null,
    },
    validators: { onSubmit: schema },
    onSubmit: ({ value }) => {
      onConfirm({
        llmModelId: value.llmModelId as number,
        promptId: value.promptId as number,
      });
    },
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: only reset when dialog opens or default ids resolve
  useEffect(() => {
    if (open) {
      form.reset({
        llmModelId: initialLlm,
        promptId: initialPrompt,
      });
    }
  }, [open, initialLlm, initialPrompt]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="智能格式化"
      description="使用 LLM 按提示词重排脚本，结果会流式覆盖到编辑器"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={() => form.handleSubmit()}>开始处理</Button>
        </>
      }
    >
      <form.AppForm>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <form.AppField name="llmModelId">
              {(field) => (
                <field.FormField label="LLM 模型">
                  <field.ComboboxField<number>
                    options={llmOptions}
                    className="w-full"
                    placeholder="请选择…"
                  />
                </field.FormField>
              )}
            </form.AppField>
            <form.AppField name="promptId">
              {(field) => (
                <field.FormField label="提示词">
                  <field.SelectField<number>
                    options={promptOptions}
                    className="w-full"
                    placeholder="请选择…"
                  />
                </field.FormField>
              )}
            </form.AppField>
          </div>

          <form.Subscribe selector={(s) => s.values.promptId}>
            {(promptId) => (
              <PromptPreview prompt={promptList.find((p) => p.id === promptId) ?? null} />
            )}
          </form.Subscribe>
        </div>
      </form.AppForm>
    </Dialog>
  );
}

function PromptPreview({
  prompt,
}: {
  prompt: { name: string; description: string | null; content: string } | null;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-sm">提示词预览</div>
      {prompt ? (
        <div className="flex max-h-72 flex-col gap-2 overflow-hidden rounded-md border border-content-400/20 bg-base-200 p-3">
          {prompt.description ? (
            <div className="text-xs text-content-300">{prompt.description}</div>
          ) : null}
          <div className="overflow-auto font-mono text-xs leading-6 wrap-break-word whitespace-pre-wrap text-content-200">
            {prompt.content}
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-content-400/20 bg-base-200 p-6 text-center text-sm text-content-400">
          选择提示词后这里会显示完整内容
        </div>
      )}
    </div>
  );
}
