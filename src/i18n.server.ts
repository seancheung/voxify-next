import { AsyncLocalStorage } from "node:async_hooks";
import {
  getLanguagePreference,
  type Language,
  resolveLanguage,
  setRequestLanguageResolver,
} from "./i18n";

const languages = new AsyncLocalStorage<Language>();
setRequestLanguageResolver(() => languages.getStore() ?? "en");

export function withRequestLanguage<T>(request: Request, next: () => T): T {
  const preference = getLanguagePreference(request.headers.get("cookie") ?? "");
  const tags = (request.headers.get("accept-language") ?? "")
    .split(",")
    .map((part) => {
      const [tag, quality] = part.trim().split(";q=");
      return { tag, weight: quality === undefined ? 1 : Number(quality) };
    })
    .filter(({ weight }) => weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .map(({ tag }) => tag);
  return languages.run(resolveLanguage(preference, tags), next);
}
