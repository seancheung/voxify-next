import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2Icon, UploadIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";
import type z from "zod";
import { useAppForm } from "@/components/form";
import QuickFormatDialog from "@/components/projects/quick-format-dialog";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import Radio, { RadioGroup } from "@/components/ui/radio";
import type { SelectOption } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { DEFAULT_LOCALE, LOCALES, type LocaleCode } from "@/constants/locale";
import { parseEpubFile } from "@/lib/epub-import";
import {
  type ImportProjectInput,
  importProject,
  importProjectSchema,
} from "@/lib/projects.functions";
import { type QuickFormatRules, readFormatRules } from "@/lib/quick-format-rules";
import { parseScriptText, quickFormatScript } from "@/lib/script";

type SplitStrategy = "quick" | "plain";

const localeOptions: SelectOption<LocaleCode>[] = LOCALES.map((l) => ({
  value: l.value,
  label: l.label,
}));

const metaSchema = importProjectSchema.pick({
  name: true,
  author: true,
  description: true,
  locale: true,
});

type MetaForm = z.input<typeof metaSchema>;

const MAX_FILE_BYTES = 50 * 1024 * 1024;

export default function ImportProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const importFn = useServerFn(importProject);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [strategy, setStrategy] = useState<SplitStrategy>("quick");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [parsing, setParsing] = useState(false);

  const submitMutation = useMutation({
    mutationFn: (input: ImportProjectInput) => importFn({ data: input }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success(`已导入 ${result.chaptersCreated} 个章节，${result.segmentsCreated} 段内容`);
      handleOpenChange(false);
    },
    onError: (err) =>
      toast.error({
        title: "导入失败",
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const form = useAppForm({
    defaultValues: {
      name: "",
      author: "",
      description: "",
      locale: DEFAULT_LOCALE,
    } as MetaForm,
    validators: { onSubmit: metaSchema },
    onSubmit: async ({ value }) => {
      if (!file) {
        toast.error({ title: "请先选择导入文件" });
        return;
      }
      setParsing(true);
      try {
        const chapters = await readAndSplit(file, strategy, readFormatRules());
        if (chapters.length === 0) {
          toast.error({
            title: "导入失败",
            description: "文件没有可导入的内容",
          });
          return;
        }
        submitMutation.mutate({
          name: value.name,
          author: value.author,
          description: value.description,
          locale: value.locale,
          chapters,
        });
      } catch (err) {
        toast.error({
          title: "解析失败",
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setParsing(false);
      }
    },
  });

  function handleOpenChange(next: boolean) {
    if (!next) {
      setRulesOpen(false);
      form.reset();
      submitMutation.reset();
      setFile(null);
      setStrategy("quick");
    }
    onOpenChange(next);
  }

  function pickFile(picked: File | null) {
    if (!picked) {
      setFile(null);
      return;
    }
    const ext = picked.name.toLowerCase().split(".").pop() ?? "";
    if (ext !== "txt" && ext !== "epub") {
      toast.error({
        title: "暂不支持的文件格式",
        description: "请选择 .txt 或 .epub 文件",
      });
      return;
    }
    if (picked.size > MAX_FILE_BYTES) {
      toast.error({
        title: "文件过大",
        description: "请选择小于 50MB 的文件",
      });
      return;
    }
    setFile(picked);
    if (!form.state.values.name) {
      const baseName = picked.name.replace(/\.(txt|epub)$/i, "");
      if (baseName) form.setFieldValue("name", baseName);
    }
  }

  const submitting = submitMutation.isPending || parsing;
  const fileFormat = file ? (file.name.toLowerCase().endsWith(".epub") ? "EPUB" : "TXT") : null;

  return (
    <>
      <Dialog
        open={open && !rulesOpen}
        onOpenChange={handleOpenChange}
        title="导入内容"
        description="支持 TXT（导入为单个章节）和 EPUB（按章节拆分导入）"
        size="md"
        closable={!submitting}
        footer={
          <>
            <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={submitting}>
              取消
            </Button>
            <Button disabled={submitting || !file} onClick={() => form.handleSubmit()}>
              {parsing ? "解析中…" : submitMutation.isPending ? "导入中…" : "导入"}
            </Button>
          </>
        }
      >
        <form.AppForm>
          <div className="flex flex-col gap-4">
            <form.AppField name="name">
              {(field) => (
                <field.FormField label="名称">
                  <field.InputField placeholder="例如：小王子" autoFocus />
                </field.FormField>
              )}
            </form.AppField>
            <form.AppField name="author">
              {(field) => (
                <field.FormField label="作者">
                  <field.InputField placeholder="可选" />
                </field.FormField>
              )}
            </form.AppField>
            <form.AppField name="description">
              {(field) => (
                <field.FormField label="描述">
                  <field.InputField placeholder="可选，简要介绍这个项目" />
                </field.FormField>
              )}
            </form.AppField>
            <form.AppField name="locale">
              {(field) => (
                <field.FormField label="语言">
                  <field.SelectField options={localeOptions} className="w-full" />
                </field.FormField>
              )}
            </form.AppField>

            <div className="flex flex-col gap-1.5">
              <div className="text-sm">
                导入文件<span className="ml-0.5 text-error">*</span>
              </div>
              {file ? (
                <div className="flex items-center gap-2 rounded-md border border-content-400/30 bg-base-200 px-3 py-2 text-sm">
                  <span className="rounded bg-base-300 px-1.5 py-0.5 font-mono text-xs text-content-300">
                    {fileFormat}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-content-100">{file.name}</span>
                  <span className="shrink-0 text-xs text-content-400">
                    {formatBytes(file.size)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    shape="circle"
                    aria-label="移除文件"
                    disabled={submitting}
                    onClick={() => pickFile(null)}
                  >
                    <XIcon />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={submitting}
                  className="self-start"
                >
                  <UploadIcon />
                  选择 .txt 或 .epub 文件
                </Button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.epub,text/plain,application/epub+zip"
                className="hidden"
                onChange={(e) => {
                  pickFile(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              <p className="text-xs text-content-400">
                文件大小不超过 50MB；EPUB 会按 spine 顺序拆分章节
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="text-sm">分段策略</div>
              <RadioGroup<SplitStrategy>
                value={strategy}
                onChange={setStrategy}
                disabled={submitting}
                className="gap-0 divide-y divide-content-400/15 overflow-hidden rounded-md border border-content-400/25 bg-base-200"
              >
                {(["quick", "plain"] as const).map((option) => (
                  <div
                    key={option}
                    className="flex items-center gap-2 pr-3 has-checked:bg-primary-500/5"
                  >
                    <Radio
                      value={option}
                      className="min-w-0 flex-1 self-stretch px-3 py-2.5"
                      label={
                        <span className="flex flex-col gap-0.5">
                          <span className="text-content-100">
                            {option === "quick" ? "快速格式化" : "普通拆分"}
                          </span>
                          <span className="text-xs text-content-300">
                            {option === "quick"
                              ? "按格式化规则断句、合并短句"
                              : "按原文换行，每行一个段落"}
                          </span>
                        </span>
                      }
                    />
                    {option === "quick" && strategy === "quick" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0"
                        disabled={submitting}
                        onClick={() => setRulesOpen(true)}
                      >
                        规则设置
                      </Button>
                    )}
                  </div>
                ))}
              </RadioGroup>
            </div>

            {parsing && (
              <div className="flex items-center gap-2 text-xs text-content-300">
                <Loader2Icon className="size-3.5 animate-spin" />
                正在解析文件…
              </div>
            )}

            {submitMutation.isError && (
              <form.FormError className="mx-auto max-w-md">
                {submitMutation.error.message}
              </form.FormError>
            )}
          </div>
        </form.AppForm>
      </Dialog>
      {open && rulesOpen && (
        <QuickFormatDialog
          confirmLabel="确定"
          onConfirm={() => setRulesOpen(false)}
          onCancel={() => setRulesOpen(false)}
        />
      )}
    </>
  );
}

async function readAndSplit(
  file: File,
  strategy: SplitStrategy,
  rules: QuickFormatRules,
): Promise<ImportProjectInput["chapters"]> {
  const isEpub = file.name.toLowerCase().endsWith(".epub");
  const rawChapters = isEpub
    ? await parseEpubFile(file)
    : [
        {
          name: file.name.replace(/\.txt$/i, "") || "导入内容",
          content: await file.text(),
        },
      ];
  const out: ImportProjectInput["chapters"] = [];
  for (const c of rawChapters) {
    const segments = splitContent(c.content, strategy, rules);
    if (segments.length === 0) continue;
    out.push({ name: c.name, segments });
  }
  return out;
}

function splitContent(text: string, strategy: SplitStrategy, rules: QuickFormatRules): string[] {
  if (strategy === "quick") {
    return parseScriptText(quickFormatScript(text, rules)).map((s) => s.text);
  }
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  const formatted = value >= 10 || i === 0 ? value.toFixed(0) : value.toFixed(1);
  return `${formatted} ${units[i]}`;
}
