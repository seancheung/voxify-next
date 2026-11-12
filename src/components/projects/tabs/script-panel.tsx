import { EditorView } from "@codemirror/view";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import CodeMirror, {
  Decoration,
  type DecorationSet,
  type Extension,
  RangeSetBuilder,
  type ReactCodeMirrorRef,
  ViewPlugin,
  type ViewUpdate,
} from "@uiw/react-codemirror";
import {
  HelpCircleIcon,
  ListRestartIcon,
  RotateCcwIcon,
  SaveIcon,
  SquareIcon,
  WandSparklesIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import QuickFormatDialog from "@/components/projects/quick-format-dialog";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import Tooltip from "@/components/ui/tooltip";
import { t } from "@/i18n";
import type { ChapterListItem } from "@/lib/chapters.functions";
import type { QuickFormatRules } from "@/lib/quick-format-rules";
import {
  type DiffLine,
  diffScriptLines,
  parseScriptText,
  quickFormatScript,
  serializeSegments,
} from "@/lib/script";
import { listSegmentsByChapter, syncChapterSegments } from "@/lib/segments.functions";
import { cn } from "@/utils/cn";
import { narratorColor } from "@/utils/narrator-color";
import SmartFormatDialog from "./smart-format-dialog";

const NARRATOR_REGEX = /^\s*(\[\[)([^\]]*)(\]\])/;

const narratorDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = build(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const bracketDeco = Decoration.mark({ class: "cm-narrator-bracket" });
  const nameMarks = new Map<string, Decoration>();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const text = line.text;
      const m = NARRATOR_REGEX.exec(text);
      if (m) {
        const open = m[1] ?? "";
        const name = m[2] ?? "";
        const close = m[3] ?? "";
        const start = line.from + m[0].length - open.length - name.length - close.length;
        const openEnd = start + open.length;
        const nameEnd = openEnd + name.length;
        const closeEnd = nameEnd + close.length;
        builder.add(start, openEnd, bracketDeco);
        if (name.length > 0) {
          let mark = nameMarks.get(name);
          if (!mark) {
            mark = Decoration.mark({
              class: "cm-narrator-name",
              attributes: { style: `color: ${narratorColor(name)}` },
            });
            nameMarks.set(name, mark);
          }
          builder.add(openEnd, nameEnd, mark);
        }
        builder.add(nameEnd, closeEnd, bracketDeco);
      }
      if (line.to >= to) break;
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

const editorTheme: Extension = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "var(--color-base-100)",
      color: "var(--color-content-100)",
      fontSize: "13px",
      fontFamily: "var(--font-mono)",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      fontFamily: "var(--font-mono)",
      lineHeight: "1.7",
    },
    ".cm-content": {
      caretColor: "var(--color-primary-500)",
      padding: "12px 0",
    },
    ".cm-gutters": {
      backgroundColor: "var(--color-base-200)",
      color: "var(--color-content-400)",
      borderRight: "1px solid color-mix(in srgb, var(--color-content-400) 20%, transparent)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "color-mix(in srgb, var(--color-base-400) 60%, transparent)",
      color: "var(--color-content-200)",
    },
    ".cm-activeLine": {
      backgroundColor: "color-mix(in srgb, var(--color-base-300) 60%, transparent)",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 12px 0 8px",
    },
    ".cm-narrator-bracket": {
      color: "var(--color-content-400)",
    },
    ".cm-narrator-name": {
      fontWeight: "600",
    },
    "&.cm-editor.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
      backgroundColor: "color-mix(in srgb, var(--color-primary-400) 30%, transparent)",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--color-primary-500)",
    },
  },
  { dark: true },
);

export default function ScriptPanel({ chapter }: { chapter: ChapterListItem }) {
  const qc = useQueryClient();
  const fetchSegments = useServerFn(listSegmentsByChapter);
  const syncFn = useServerFn(syncChapterSegments);

  const { data: segments = [] } = useQuery({
    queryKey: ["segments", chapter.id],
    queryFn: () => fetchSegments({ data: { chapterId: chapter.id } }),
  });

  const initialText = serializeSegments(
    segments
      .filter((s) => (s.content ?? "").trim().length > 0)
      .map((s) => ({
        narratorName: s.narratorName,
        text: (s.content ?? "").trim(),
      })),
  );

  const [draft, setDraft] = useState(initialText);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffLines, setDiffLines] = useState<DiffLine[]>([]);
  const [quickFormatOpen, setQuickFormatOpen] = useState(false);
  const [smartFormatOpen, setSmartFormatOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [postInterruptOpen, setPostInterruptOpen] = useState(false);
  const streamCtrlRef = useRef<AbortController | null>(null);
  const beforeStreamRef = useRef<string>("");
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset draft when chapter changes or segments reload from server
  useEffect(() => {
    setDraft(initialText);
  }, [chapter.id, initialText]);

  const dirty = draft !== initialText;

  const stats = computeScriptStats(draft);

  const syncMut = useMutation({
    mutationFn: () => {
      const drafts = parseScriptText(draft);
      return syncFn({ data: { chapterId: chapter.id, drafts } });
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["segments", chapter.id] });
      qc.invalidateQueries({ queryKey: ["narrators", chapter.projectId] });
      qc.invalidateQueries({ queryKey: ["chapters", chapter.projectId] });
      const parts: string[] = [];
      if (result.inserted > 0) parts.push(t("Added {0}", result.inserted));
      if (result.removed > 0) parts.push(t("Removed {0}", result.removed));
      if (result.preserved > 0 && (result.inserted > 0 || result.removed > 0)) {
        parts.push(t("Kept {0}", result.preserved));
      }
      if (result.narratorsCreated > 0) {
        parts.push(t("Created character {0}", result.narratorsCreated));
      }
      toast.success(parts.length > 0 ? t("Saved ({0})", parts.join("，")) : t("Saved"));
      setDiffOpen(false);
    },
    onError: (err) =>
      toast.error({
        title: t("Save failed"),
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  function handleSave() {
    const normalizedDraft = serializeSegments(parseScriptText(draft));
    const lines = diffScriptLines(initialText, normalizedDraft);
    const hasChange = lines.some((l) => l.kind !== "unchanged");
    if (!hasChange) return;
    setDiffLines(lines);
    setDiffOpen(true);
  }

  function handleReset() {
    setDraft(initialText);
  }

  function confirmQuickFormat(rules: QuickFormatRules) {
    const formatted = quickFormatScript(draft, rules);
    setQuickFormatOpen(false);
    if (formatted === draft) return;
    setDraft(formatted);
  }

  async function startSmartFormat(payload: { llmModelId: number; promptId: number }) {
    beforeStreamRef.current = draft;
    setSmartFormatOpen(false);
    setStreaming(true);
    setDraft("");
    const ac = new AbortController();
    streamCtrlRef.current = ac;
    let userAborted = false;
    try {
      const resp = await fetch("/api/llm/format-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llmModelId: payload.llmModelId,
          promptId: payload.promptId,
          text: beforeStreamRef.current,
        }),
        signal: ac.signal,
      });
      if (!resp.ok || !resp.body) {
        let msg = `HTTP ${resp.status}`;
        try {
          const json = (await resp.json()) as { error?: string };
          if (json.error) msg = json.error;
        } catch {
          // ignore
        }
        throw new Error(msg);
      }
      await readSSEStream(resp.body, ac.signal, (msg) => {
        if (msg.error) {
          throw new Error(msg.error);
        }
        if (typeof msg.chunk === "string" && msg.chunk.length > 0) {
          setDraft((prev) => prev + msg.chunk);
        }
      });
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") {
        userAborted = true;
      } else {
        toast.error({
          title: t("Smart formatting failed"),
          description: err instanceof Error ? err.message : String(err),
        });
        setDraft(beforeStreamRef.current);
      }
    } finally {
      streamCtrlRef.current = null;
      setStreaming(false);
      if (userAborted) setPostInterruptOpen(true);
    }
  }

  function abortStream() {
    streamCtrlRef.current?.abort();
  }

  function restoreBeforeStream() {
    setDraft(beforeStreamRef.current);
    setPostInterruptOpen(false);
  }

  function keepCurrentDraft() {
    setPostInterruptOpen(false);
  }

  const extensions: Extension[] = [editorTheme, narratorDecorations, EditorView.lineWrapping];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          onClick={() => setQuickFormatOpen(true)}
          disabled={!draft.trim() || syncMut.isPending || streaming}
        >
          <ListRestartIcon />
          {t("Quick format")}
        </Button>
        {streaming ? (
          <Button variant="danger" onClick={abortStream}>
            <SquareIcon />
            {t("Interrupt processing")}
          </Button>
        ) : (
          <Button
            variant="secondary"
            onClick={() => setSmartFormatOpen(true)}
            disabled={!draft.trim() || syncMut.isPending}
          >
            <WandSparklesIcon />
            {t("Smart format")}
          </Button>
        )}
        <Tooltip
          side="bottom"
          align="start"
          delay={100}
          className="max-w-sm"
          content={<SyntaxHelp />}
        >
          <Button variant="ghost" size="sm" shape="circle" aria-label={t("Syntax guide")}>
            <HelpCircleIcon />
          </Button>
        </Tooltip>
        <span className="ml-auto text-xs text-content-300 tabular-nums">
          {t("{0} segments · {1} characters", stats.lines, stats.chars)}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={handleReset} disabled={!dirty || streaming}>
            <RotateCcwIcon />
            {t("Reset")}
          </Button>
          <Button onClick={handleSave} disabled={!dirty || syncMut.isPending || streaming}>
            <SaveIcon />
            {t("Save")}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-content-400/20 bg-base-100">
        <CodeMirror
          ref={editorRef}
          value={draft}
          height="100%"
          theme="dark"
          extensions={extensions}
          onChange={setDraft}
          editable={!streaming}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLine: true,
            highlightActiveLineGutter: true,
            foldGutter: false,
            bracketMatching: false,
            closeBrackets: false,
            autocompletion: false,
            indentOnInput: false,
            searchKeymap: true,
            dropCursor: true,
            allowMultipleSelections: true,
          }}
          className="h-full"
        />
      </div>

      <Dialog
        open={diffOpen}
        onOpenChange={(open) => {
          if (!open && !syncMut.isPending) setDiffOpen(false);
        }}
        title={t("Apply changes?")}
        description={t(
          "Saving applies these changes to the segments. Unchanged segments retain their generated audio.",
        )}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDiffOpen(false)} disabled={syncMut.isPending}>
              {t("Cancel")}
            </Button>
            <Button onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
              {syncMut.isPending ? t("Saving…") : t("Confirm save")}
            </Button>
          </>
        }
      >
        <DiffView lines={diffLines} />
      </Dialog>

      {quickFormatOpen && (
        <QuickFormatDialog
          confirmLabel={t("Apply to editor")}
          onConfirm={confirmQuickFormat}
          onCancel={() => setQuickFormatOpen(false)}
        />
      )}

      <SmartFormatDialog
        open={smartFormatOpen}
        onOpenChange={setSmartFormatOpen}
        projectId={chapter.projectId}
        onConfirm={startSmartFormat}
      />

      <Dialog
        open={postInterruptOpen}
        onOpenChange={(open) => {
          if (!open) keepCurrentDraft();
        }}
        title={t("Smart formatting interrupted")}
        description={t("Restore the text from before processing?")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={keepCurrentDraft}>
              {t("Keep current text")}
            </Button>
            <Button onClick={restoreBeforeStream}>{t("Restore text")}</Button>
          </>
        }
      >
        <div className="text-sm leading-6 text-content-200">
          {t(
            "Processing stopped. The editor contains the streamed text. You can restore the previous version.",
          )}
        </div>
      </Dialog>
    </div>
  );
}

function computeScriptStats(text: string): { lines: number; chars: number } {
  let lines = 0;
  let chars = 0;
  for (const raw of text.split("\n")) {
    const body = raw.replace(NARRATOR_REGEX, "").trim();
    if (body.length === 0) continue;
    lines += 1;
    chars += [...body.replace(/\s+/g, "")].length;
  }
  return { lines, chars };
}

async function readSSEStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onMsg: (msg: { chunk?: string; done?: boolean; error?: string }) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      if (signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx = buf.indexOf("\n\n");
      while (idx !== -1) {
        const event = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const dataLines = event.split("\n").filter((l) => l.startsWith("data:"));
        if (dataLines.length > 0) {
          const data = dataLines.map((l) => l.slice(5).trim()).join("\n");
          let parsed: {
            chunk?: string;
            done?: boolean;
            error?: string;
          } | null = null;
          try {
            parsed = JSON.parse(data);
          } catch {
            // skip malformed event
          }
          if (parsed) onMsg(parsed);
        }
        idx = buf.indexOf("\n\n");
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

function DiffView({ lines }: { lines: DiffLine[] }) {
  if (lines.length === 0) {
    return (
      <div className="rounded-md border border-content-400/20 bg-base-200 p-6 text-center text-sm text-content-400">
        {t("No differences")}
      </div>
    );
  }
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.kind === "added") added++;
    else if (l.kind === "removed") removed++;
  }
  const colWidth = String(
    Math.max(...lines.map((l) => Math.max(l.originalLineNo ?? 0, l.draftLineNo ?? 0)), 1),
  ).length;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-sm">
        <span className="text-content-300">{t("Changes:")}</span>
        <span className="inline-flex items-center gap-1 text-success">
          <span className="font-mono">+{added}</span>
          <span className="text-xs text-content-300">{t("Added")}</span>
        </span>
        <span className="inline-flex items-center gap-1 text-error">
          <span className="font-mono">-{removed}</span>
          <span className="text-xs text-content-300">{t("Delete")}</span>
        </span>
      </div>
      <div className="max-h-[60vh] overflow-auto rounded-md border border-content-400/20 bg-base-200 font-mono text-xs">
        {lines.map((line, i) => (
          <DiffRow key={i} line={line} colWidth={colWidth} />
        ))}
      </div>
    </div>
  );
}

function DiffRow({ line, colWidth }: { line: DiffLine; colWidth: number }) {
  const sign = line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " ";
  const rowClass = cn(
    "grid items-start gap-2 px-3 py-0.5 leading-6",
    line.kind === "added" && "bg-success/10",
    line.kind === "removed" && "bg-error/10",
    line.kind === "unchanged" && "text-content-300",
  );
  const textClass = cn(
    "wrap-break-word whitespace-pre-wrap",
    line.kind === "added" && "text-success",
    line.kind === "removed" && "text-error line-through decoration-error/60",
    line.kind === "unchanged" && "text-content-200",
  );
  const lineNo = line.kind === "removed" ? line.originalLineNo : line.draftLineNo;
  return (
    <div
      className={rowClass}
      style={{
        gridTemplateColumns: `${colWidth}ch 1ch minmax(0, 1fr)`,
      }}
    >
      <span className="text-right text-content-400 tabular-nums select-none">{lineNo ?? ""}</span>
      <span className="text-content-400 select-none">{sign}</span>
      <span className={textClass}>{line.text || " "}</span>
    </div>
  );
}

function SyntaxHelp() {
  return (
    <div className="space-y-2 text-left text-xs leading-5 text-content-200">
      <div className="text-sm font-semibold text-content-100">{t("Script syntax")}</div>
      <ul className="list-disc space-y-1 pl-4">
        <li>
          {t("Use one segment per line, in this format:")}
          <code className="ml-1 rounded bg-base-300 px-1 py-0.5 font-mono">
            <span className="text-content-400">[[</span>
            <span className="text-primary-400">{t("Character tag")}</span>
            <span className="text-content-400">]]</span>
            {t("Segment text")}
          </code>
        </li>
        <li>
          {t("Omit")}
          <code className="mx-1 rounded bg-base-300 px-1 py-0.5 font-mono">[[…]]</code>
          {t("to use the default character")}
        </li>
        <li>
          {t(
            "Saving creates missing characters in the Characters panel. Assign their voices there.",
          )}
        </li>
        <li>
          {t("Saving ignores blank lines, extra whitespace and character tags without text.")}
        </li>
        <li>
          {t("Saving compares")}
          <span className="text-primary-400">{t(" (character, text) ")}</span>
          {t("to preserve generated audio for unchanged segments.")}
        </li>
      </ul>
    </div>
  );
}
