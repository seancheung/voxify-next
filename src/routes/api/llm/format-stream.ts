import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { t } from "@/i18n";

const requestSchema = z.object({
  llmModelId: z.number().int().positive(),
  promptId: z.number().int().positive(),
  text: z.string(),
});

// Formatting preserves the input, adding only line breaks and speaker tags.
// Allow 1.6 tokens per Chinese character plus 1024 tokens of headroom.
function estimateMaxOutputTokens(text: string): number {
  return Math.ceil(text.length * 1.6) + 1024;
}

export const Route = createFileRoute("/api/llm/format-stream")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed: z.infer<typeof requestSchema>;
        try {
          const body = await request.json();
          parsed = requestSchema.parse(body);
        } catch (err) {
          return new Response(
            JSON.stringify({
              error: err instanceof Error ? err.message : t("Invalid request parameters"),
            }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const { db } = await import("@/db");
        const { configs, llmModels, llmServices, prompts } = await import("@/db/schema");
        const [model] = await db
          .select({
            modelKey: llmModels.key,
            serviceType: llmServices.type,
            serviceBaseUrl: llmServices.baseUrl,
            serviceApiKey: llmServices.apiKey,
            serviceSettings: llmServices.settings,
          })
          .from(llmModels)
          .innerJoin(llmServices, eq(llmModels.llmServiceId, llmServices.id))
          .where(eq(llmModels.id, parsed.llmModelId));
        if (!model) {
          return new Response(JSON.stringify({ error: t("LLM model not found") }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        const [prompt] = await db.select().from(prompts).where(eq(prompts.id, parsed.promptId));
        if (!prompt) {
          return new Response(JSON.stringify({ error: t("Prompt not found") }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { appConfigSchema, DEFAULT_APP_CONFIG } = await import("@/lib/configs.functions");
        const [configRow] = await db.select().from(configs).where(eq(configs.key, "app_config"));
        const appConfig = appConfigSchema.safeParse(configRow?.value ?? {});
        const timeoutMs = appConfig.success
          ? appConfig.data.defaultLlmTimeoutMs
          : DEFAULT_APP_CONFIG.defaultLlmTimeoutMs;

        const { streamLLMText } = await import("@/lib/llm-stream.server");
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            let closed = false;
            const send = (data: unknown) => {
              if (closed) return;
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
              } catch {
                closed = true;
              }
            };
            const ac = new AbortController();
            const onAbort = () => ac.abort();
            request.signal.addEventListener("abort", onAbort);
            let timedOut = false;
            const timeoutTimer = setTimeout(() => {
              timedOut = true;
              ac.abort();
            }, timeoutMs);
            try {
              const estimated = estimateMaxOutputTokens(parsed.text);
              const cap = model.serviceSettings?.maxOutputTokens;
              const maxOutputTokens = cap != null ? Math.min(estimated, cap) : estimated;
              await streamLLMText({
                service: {
                  type: model.serviceType,
                  baseUrl: model.serviceBaseUrl,
                  apiKey: model.serviceApiKey,
                  model: model.modelKey,
                  settings: model.serviceSettings,
                },
                systemPrompt: prompt.content,
                userText: parsed.text,
                maxOutputTokens,
                signal: ac.signal,
                onChunk: (chunk) => send({ chunk }),
              });
              send({ done: true });
            } catch (err) {
              if (timedOut) {
                send({ error: t("LLM request timed out ({0} ms)", timeoutMs) });
              } else if ((err as { name?: string })?.name !== "AbortError") {
                send({
                  error: err instanceof Error ? err.message : String(err),
                });
              }
            } finally {
              clearTimeout(timeoutTimer);
              request.signal.removeEventListener("abort", onAbort);
              closed = true;
              try {
                controller.close();
              } catch {
                // already closed
              }
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
