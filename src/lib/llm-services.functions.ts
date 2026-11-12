import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { llmServices } from "@/db/schema";
import { t } from "@/i18n";
import { type LLMSettings, LLMType } from "@/types/llm";

export interface LLMServiceListItem {
  id: number;
  name: string;
  type: LLMType;
  baseUrl: string;
  settings: LLMSettings | null;
  enabled: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}

const listColumns = {
  id: llmServices.id,
  name: llmServices.name,
  type: llmServices.type,
  baseUrl: llmServices.baseUrl,
  settings: llmServices.settings,
  enabled: llmServices.enabled,
  createdAt: llmServices.createdAt,
  updatedAt: llmServices.updatedAt,
};

export const DEFAULT_LLM_BASE_URLS: Record<LLMType, string> = {
  [LLMType.OpenAI]: "https://api.openai.com/v1",
  [LLMType.Anthropic]: "https://api.anthropic.com",
  [LLMType.GoogleGenerativeAI]: "https://generativelanguage.googleapis.com",
  [LLMType.Ollama]: "http://localhost:11434",
  [LLMType.DeepSeek]: "https://api.deepseek.com/v1",
};

export const listLLMServices = createServerFn({ method: "GET" }).handler(
  async (): Promise<LLMServiceListItem[]> => {
    return db.select(listColumns).from(llmServices).orderBy(llmServices.createdAt);
  },
);

const idSchema = z.object({ id: z.number().int().positive() });

const settingsSchema = z
  .object({
    temperature: z.number().min(0).max(2).nullish(),
    maxOutputTokens: z.number().int().positive().nullish(),
  })
  .partial()
  .passthrough()
  .optional()
  .nullable();

function normalizeSettings(input: z.output<typeof settingsSchema>): LLMSettings | null {
  if (!input) return null;
  const out: LLMSettings = {};
  if (input.temperature != null) out.temperature = input.temperature;
  if (input.maxOutputTokens != null) out.maxOutputTokens = input.maxOutputTokens;
  return Object.keys(out).length > 0 ? out : null;
}

const baseFields = {
  name: z
    .string()
    .trim()
    .min(1, { error: () => t("Enter a name") })
    .max(120),
  type: z.union([
    z.literal(LLMType.OpenAI),
    z.literal(LLMType.Anthropic),
    z.literal(LLMType.GoogleGenerativeAI),
    z.literal(LLMType.Ollama),
    z.literal(LLMType.DeepSeek),
  ]),
  baseUrl: z
    .string()
    .trim()
    .min(1, { error: () => t("Enter a base URL") })
    .url({ error: () => t("Invalid URL") }),
  apiKey: z.string().trim().nullable(),
  settings: settingsSchema,
};

export const createLLMServiceSchema = z.object(baseFields);
export const updateLLMServiceSchema = z.object({
  id: z.number().int().positive(),
  ...baseFields,
});

const toggleSchema = z.object({
  id: z.number().int().positive(),
  enabled: z.boolean(),
});

export const createLLMService = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof createLLMServiceSchema>) => createLLMServiceSchema.parse(data))
  .handler(async ({ data }): Promise<LLMServiceListItem> => {
    const now = new Date();
    const [created] = await db
      .insert(llmServices)
      .values({
        name: data.name,
        type: data.type,
        baseUrl: data.baseUrl,
        apiKey: data.apiKey ? data.apiKey : null,
        settings: normalizeSettings(data.settings),
        enabled: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning(listColumns);
    return created;
  });

export const updateLLMService = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof updateLLMServiceSchema>) => updateLLMServiceSchema.parse(data))
  .handler(async ({ data }): Promise<LLMServiceListItem> => {
    const now = new Date();
    const updates: Partial<typeof llmServices.$inferInsert> = {
      name: data.name,
      type: data.type,
      baseUrl: data.baseUrl,
      settings: normalizeSettings(data.settings),
      updatedAt: now,
    };
    if (data.apiKey && data.apiKey !== "") {
      updates.apiKey = data.apiKey;
    }
    const [updated] = await db
      .update(llmServices)
      .set(updates)
      .where(eq(llmServices.id, data.id))
      .returning(listColumns);
    if (!updated) throw new Error(t("LLM service not found"));
    return updated;
  });

export const toggleLLMService = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof toggleSchema>) => toggleSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await db
      .update(llmServices)
      .set({ enabled: data.enabled, updatedAt: new Date() })
      .where(eq(llmServices.id, data.id));
    return { ok: true as const };
  });

export const deleteLLMService = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof idSchema>) => idSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await db.delete(llmServices).where(eq(llmServices.id, data.id));
    return { ok: true as const };
  });

export interface RemoteLLMModel {
  key: string;
  name: string;
  description: string | null;
}

// Whether the service type exposes a "list models" endpoint we can consume.
export function supportsModelSync(type: LLMType): boolean {
  switch (type) {
    case LLMType.OpenAI:
    case LLMType.Anthropic:
    case LLMType.GoogleGenerativeAI:
    case LLMType.Ollama:
    case LLMType.DeepSeek:
      return true;
    default:
      return false;
  }
}

export function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await p;
  } finally {
    clearTimeout(timer);
  }
}

async function safeText(resp: Response): Promise<string> {
  try {
    const text = await resp.text();
    return text.slice(0, 200);
  } catch {
    return "";
  }
}

async function fetchOpenAIModels(
  baseUrl: string,
  apiKey: string | null,
): Promise<RemoteLLMModel[]> {
  const url = `${stripTrailingSlash(baseUrl)}/models`;
  const resp = await withTimeout(
    fetch(url, {
      headers: {
        Accept: "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    }),
    20_000,
  );
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await safeText(resp)}`);
  const json = (await resp.json()) as {
    data?: Array<{ id?: string }>;
  };
  return (json.data ?? [])
    .filter((m) => typeof m.id === "string" && m.id.length > 0)
    .map((m) => ({
      key: m.id as string,
      name: m.id as string,
      description: null,
    }));
}

async function fetchAnthropicModels(
  baseUrl: string,
  apiKey: string | null,
): Promise<RemoteLLMModel[]> {
  const url = `${stripTrailingSlash(baseUrl)}/v1/models`;
  const resp = await withTimeout(
    fetch(url, {
      headers: {
        Accept: "application/json",
        "anthropic-version": "2023-06-01",
        ...(apiKey ? { "x-api-key": apiKey } : {}),
      },
    }),
    20_000,
  );
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await safeText(resp)}`);
  const json = (await resp.json()) as {
    data?: Array<{ id?: string; display_name?: string }>;
  };
  return (json.data ?? [])
    .filter((m) => typeof m.id === "string" && m.id.length > 0)
    .map((m) => ({
      key: m.id as string,
      name: m.display_name ?? (m.id as string),
      description: null,
    }));
}

async function fetchGoogleModels(
  baseUrl: string,
  apiKey: string | null,
): Promise<RemoteLLMModel[]> {
  const params = apiKey ? `?key=${encodeURIComponent(apiKey)}` : "";
  const url = `${stripTrailingSlash(baseUrl)}/v1beta/models${params}`;
  const resp = await withTimeout(fetch(url, { headers: { Accept: "application/json" } }), 20_000);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await safeText(resp)}`);
  const json = (await resp.json()) as {
    models?: Array<{
      name?: string;
      displayName?: string;
      description?: string;
      supportedGenerationMethods?: string[];
    }>;
  };
  return (json.models ?? [])
    .filter(
      (m) =>
        typeof m.name === "string" &&
        m.name.length > 0 &&
        (m.supportedGenerationMethods?.includes("generateContent") ?? true),
    )
    .map((m) => {
      const fullName = m.name as string;
      const key = fullName.startsWith("models/") ? fullName.slice("models/".length) : fullName;
      return {
        key,
        name: m.displayName ?? key,
        description: m.description ?? null,
      };
    });
}

async function fetchOllamaModels(baseUrl: string): Promise<RemoteLLMModel[]> {
  const url = `${stripTrailingSlash(baseUrl)}/api/tags`;
  const resp = await withTimeout(fetch(url, { headers: { Accept: "application/json" } }), 20_000);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await safeText(resp)}`);
  const json = (await resp.json()) as {
    models?: Array<{ name?: string; model?: string }>;
  };
  return (json.models ?? [])
    .map((m) => m.name ?? m.model)
    .filter((n): n is string => typeof n === "string" && n.length > 0)
    .map((n) => ({ key: n, name: n, description: null }));
}

export async function fetchRemoteLLMModels(
  type: LLMType,
  baseUrl: string,
  apiKey: string | null,
): Promise<RemoteLLMModel[]> {
  switch (type) {
    case LLMType.OpenAI:
    case LLMType.DeepSeek:
      return fetchOpenAIModels(baseUrl, apiKey);
    case LLMType.Anthropic:
      return fetchAnthropicModels(baseUrl, apiKey);
    case LLMType.GoogleGenerativeAI:
      return fetchGoogleModels(baseUrl, apiKey);
    case LLMType.Ollama:
      return fetchOllamaModels(baseUrl);
    default:
      throw new Error(t("This service does not support model sync"));
  }
}

export const pingLLMServiceSchema = z.object({
  id: z.number().int().positive().optional(),
  type: baseFields.type,
  baseUrl: baseFields.baseUrl,
  apiKey: baseFields.apiKey,
});

export const pingLLMService = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof pingLLMServiceSchema>) => pingLLMServiceSchema.parse(data))
  .handler(async ({ data }): Promise<{ count: number; latencyMs: number }> => {
    let apiKey = data.apiKey ? data.apiKey : null;
    if (data.id && !apiKey) {
      const [svc] = await db
        .select({ apiKey: llmServices.apiKey })
        .from(llmServices)
        .where(eq(llmServices.id, data.id));
      if (svc) apiKey = svc.apiKey;
    }
    const start = Date.now();
    const models = await fetchRemoteLLMModels(data.type, data.baseUrl, apiKey);
    return { count: models.length, latencyMs: Date.now() - start };
  });
