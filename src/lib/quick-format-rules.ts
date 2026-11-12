import { z } from "zod";
import { t } from "@/i18n";

export const punctuationGroups = [
  {
    chars: "。",
    get label() {
      return t("Period");
    },
  },
  {
    chars: "？?",
    get label() {
      return t("Question mark");
    },
  },
  {
    chars: "！!",
    get label() {
      return t("Exclamation mark");
    },
  },
  {
    chars: "；;",
    get label() {
      return t("Semicolon");
    },
  },
  {
    chars: "：:",
    get label() {
      return t("Colon");
    },
  },
  {
    chars: "…",
    get label() {
      return t("Ellipsis");
    },
  },
] as const;

const schema = z.object({
  punctuation: z.array(z.enum(["。", "？?", "！!", "；;", "：:", "…"])),
  mergeShort: z.boolean(),
  keepQuotes: z.boolean().default(false),
  keepBrackets: z.boolean().default(false),
  acrossLines: z.boolean(),
  shortLimit: z.number().int().nonnegative(),
  previousLimit: z.number().int().nonnegative(),
});
export type QuickFormatRules = z.infer<typeof schema>;
export const defaultRules: QuickFormatRules = {
  punctuation: punctuationGroups.map((group) => group.chars),
  mergeShort: true,
  keepQuotes: false,
  keepBrackets: false,
  acrossLines: true,
  shortLimit: 10,
  previousLimit: 50,
};

const storageKey = "voxify:quick-format-rules";
let sessionRules = defaultRules;
export function readFormatRules(): QuickFormatRules {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return sessionRules;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : defaultRules;
  } catch {
    return sessionRules;
  }
}

export function rememberFormatRules(rules: QuickFormatRules) {
  sessionRules = rules;
  try {
    localStorage.setItem(storageKey, JSON.stringify(rules));
  } catch {
    // Keep confirmed preferences available for this session.
  }
}
