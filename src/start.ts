import { createMiddleware, createStart } from "@tanstack/react-start";
import { withRequestLanguage } from "./i18n.server";

const languageMiddleware = createMiddleware().server(({ request, next }) =>
  withRequestLanguage(request, next),
);

export const startInstance = createStart(() => ({ requestMiddleware: [languageMiddleware] }));
