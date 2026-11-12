import { t } from "@/i18n";
export type LocaleCode = "en" | "zh-CN";

export const LOCALES: ReadonlyArray<{ value: LocaleCode; label: string }> = [
  { value: "en", label: "English" },
  {
    value: "zh-CN",
    get label() {
      return t("Simplified Chinese");
    },
  },
];

export const DEFAULT_LOCALE: LocaleCode = "en";

export function getLocaleLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return LOCALES.find((l) => l.value === code)?.label ?? code;
}
