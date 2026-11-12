import { diffLines as jsDiffLines } from "diff";
import { defaultRules, type QuickFormatRules } from "./quick-format-rules";

export type ParsedSegmentLine = {
  narratorName: string | null;
  text: string;
};

export type DiffLineKind = "added" | "removed" | "unchanged";

export type DiffLine = {
  kind: DiffLineKind;
  text: string;
  originalLineNo?: number;
  draftLineNo?: number;
};

const NARRATOR_PATTERN = /^\s*\[\[([^\]]*)\]\](.*)$/;

export function serializeSegmentLine(seg: { narratorName: string | null; text: string }): string {
  const name = seg.narratorName?.trim();
  const text = seg.text.trim();
  return name ? `[[${name}]]${text}` : text;
}

export function serializeSegments(
  segs: readonly { narratorName: string | null; text: string }[],
): string {
  return segs.map(serializeSegmentLine).join("\n");
}

/**
 * Trim each line and ignore blank lines and speaker tags without text.
 */
export function parseScriptText(input: string): ParsedSegmentLine[] {
  const lines = input.split(/\r?\n/);
  const out: ParsedSegmentLine[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") continue;
    const m = NARRATOR_PATTERN.exec(line);
    if (m) {
      const narratorName = (m[1] ?? "").trim() || null;
      const text = (m[2] ?? "").trim();
      if (text === "") continue;
      out.push({ narratorName, text });
    } else {
      out.push({ narratorName: null, text: line });
    }
  }
  return out;
}

/**
 * Use the same normalization for diffing and saving.
 */
export function normalizeScriptText(input: string): string {
  return serializeSegments(parseScriptText(input));
}

const SENTENCE_CLOSER_CHARS = "\"'“”‘’」』）)】〉》\\]}";
function countChars(s: string): number {
  return (s.match(/[^\p{P}\s]/gu) ?? []).length;
}

// Scan UTF-16 offsets so the split positions also index the original string.
const quotePairs = new Map(
  Object.entries({ "“": "”", "‘": "’", "「": "」", "『": "』", '"': '"', "'": "'" }),
);
const bracketPairs = new Map(
  Object.entries({
    "(": ")",
    "（": "）",
    "[": "]",
    "【": "】",
    "〔": "〕",
    "{": "}",
    "｛": "｝",
    "［": "］",
    "《": "》",
    "〈": "〉",
  }),
);

function maskPairedText(body: string, rules: QuickFormatRules, punctuation: string): string {
  if (!rules.keepQuotes && !rules.keepBrackets) return body;
  const stack: { start: number; closer: string }[] = [];
  const ends = new Map<number, number>();
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (
      (char === "'" || char === "’") &&
      /[a-z0-9]/i.test(body.charAt(i - 1)) &&
      /[a-z0-9]/i.test(body.charAt(i + 1))
    )
      continue;
    const last = stack.at(-1);
    if (last?.closer === char) {
      ends.set(last.start, i);
      stack.pop();
      continue;
    }
    const closer =
      (rules.keepQuotes ? quotePairs.get(char) : undefined) ??
      (rules.keepBrackets ? bracketPairs.get(char) : undefined);
    if (closer) stack.push({ start: i, closer });
  }
  if (!ends.size) return body;
  const parts: string[] = [];
  let copied = 0;
  for (let i = 0; i < body.length; i++) {
    const end = ends.get(i);
    if (end === undefined) continue;
    parts.push(body.slice(copied, i));
    // A sentence ending immediately before closing delimiters may still
    // break after the whole pair, e.g. “Hello! Goodbye!” followed by prose.
    let tail = end - 1;
    while (tail > i && SENTENCE_CLOSER_CHARS.includes(body[tail])) tail--;
    const boundary = punctuation.includes(body[tail]) ? body[tail] : "_";
    parts.push("_".repeat(end - i), boundary);
    copied = end + 1;
    i = end;
  }
  return parts.join("") + body.slice(copied);
}

type FormattedItem =
  | { kind: "split"; narrator: string | null; body: string; lineIndex: number }
  | { kind: "raw"; text: string };

export function quickFormatScript(input: string, rules: QuickFormatRules = defaultRules): string {
  const chars = rules.punctuation.join("");
  const pattern = chars
    ? new RegExp(`[^${chars}]*[${chars}]+[${SENTENCE_CLOSER_CHARS}]*|[^${chars}]+`, "g")
    : null;

  const items: FormattedItem[] = [];
  for (const [lineIndex, line] of input.split(/\r?\n/).entries()) {
    if (line.trim() === "") continue;
    const m = NARRATOR_PATTERN.exec(line);
    let narrator: string | null = null;
    let body = line;
    if (m) {
      const name = (m[1] ?? "").trim();
      narrator = name === "" ? null : name;
      body = m[2] ?? "";
    }
    const pieces = (
      pattern
        ? Array.from(maskPairedText(body, rules, chars).matchAll(pattern), (match) =>
            body.slice(match.index, match.index + match[0].length),
          )
        : [body]
    )
      .map((piece) => piece.trim())
      .filter(Boolean);
    if (pieces.length === 0) {
      items.push({ kind: "raw", text: line });
      continue;
    }
    for (const piece of pieces) {
      items.push({ kind: "split", narrator, body: piece, lineIndex });
    }
  }

  const merged: FormattedItem[] = [];
  for (const item of items) {
    const last = merged[merged.length - 1];
    if (
      rules.mergeShort &&
      last !== undefined &&
      last.kind === "split" &&
      item.kind === "split" &&
      last.narrator === item.narrator &&
      (rules.acrossLines || last.lineIndex === item.lineIndex) &&
      countChars(item.body) <= rules.shortLimit &&
      countChars(last.body) <= rules.previousLimit
    ) {
      merged[merged.length - 1] = {
        kind: "split",
        narrator: last.narrator,
        lineIndex: item.lineIndex,
        body: last.body + item.body,
      };
    } else {
      merged.push(item);
    }
  }

  return merged
    .map((item) => {
      if (item.kind === "raw") return item.text;
      const prefix = item.narrator !== null ? `[[${item.narrator}]]` : "";
      return prefix + item.body;
    })
    .join("\n");
}

export function diffScriptLines(original: string, draft: string): DiffLine[] {
  const parts = jsDiffLines(ensureTrailingNewline(original), ensureTrailingNewline(draft));
  const out: DiffLine[] = [];
  let originalLineNo = 1;
  let draftLineNo = 1;
  for (const part of parts) {
    const lines = splitLinesPreservingNewline(part.value);
    for (const line of lines) {
      if (line === "") continue;
      const text = stripTrailingNewline(line);
      if (part.added) {
        out.push({ kind: "added", text, draftLineNo });
        draftLineNo++;
      } else if (part.removed) {
        out.push({ kind: "removed", text, originalLineNo });
        originalLineNo++;
      } else {
        out.push({ kind: "unchanged", text, originalLineNo, draftLineNo });
        originalLineNo++;
        draftLineNo++;
      }
    }
  }
  return out;
}

function splitLinesPreservingNewline(s: string): string[] {
  if (s === "") return [];
  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\n") {
      lines.push(s.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < s.length) lines.push(s.slice(start));
  return lines;
}

function stripTrailingNewline(s: string): string {
  if (s.endsWith("\r\n")) return s.slice(0, -2);
  if (s.endsWith("\n")) return s.slice(0, -1);
  return s;
}

function ensureTrailingNewline(s: string): string {
  if (s === "") return s;
  return s.endsWith("\n") ? s : `${s}\n`;
}
