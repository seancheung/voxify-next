import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";
import { withRequestLanguage } from "./i18n.server";

const languageMiddleware = createMiddleware().server(({ request, next }) =>
  withRequestLanguage(request, next),
);

const csrfMiddleware = createCsrfMiddleware({
  filter: ({ handlerType }) => handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, languageMiddleware],
}));
