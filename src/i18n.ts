import messages from "./i18n-messages.json";

export type Language = "en" | "zh-CN";
export type LanguagePreference = Language | "system";
const cookieName = "voxify-language";

export function getLanguagePreference(cookie = document.cookie): LanguagePreference {
  const value = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
  return value === "en" || value === "zh-CN" ? value : "system";
}

export function resolveLanguage(preference: LanguagePreference, tags: readonly string[]): Language {
  if (preference !== "system") return preference;
  for (const tag of tags) {
    if (/^zh(?:-|$)/i.test(tag)) return "zh-CN";
    if (/^en(?:-|$)/i.test(tag)) return "en";
  }
  return "en";
}

// The web server installs a request-scoped resolver. Standalone workers use English.
let requestLanguage: () => Language = () => "en";
export function setRequestLanguageResolver(resolve: () => Language) {
  requestLanguage = resolve;
}

export function getLanguage(): Language {
  if (typeof document === "undefined") return requestLanguage();
  const rendered = document.documentElement.lang;
  if (rendered === "en" || rendered === "zh-CN") return rendered;
  return resolveLanguage(getLanguagePreference(), navigator.languages);
}

export function setLanguagePreference(value: LanguagePreference) {
  const maxAge = value === "system" ? 0 : 31536000;
  // biome-ignore lint/suspicious/noDocumentCookie: SSR needs the preference on the next navigation, including on HTTP installations.
  document.cookie = `${cookieName}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
  window.location.reload();
}

export function t(key: keyof typeof messages, ...values: unknown[]): string {
  const template = getLanguage() === "zh-CN" ? messages[key] : key;
  return template.replace(/\{(\d+)\}/g, (_, index) => String(values[Number(index)]));
}
