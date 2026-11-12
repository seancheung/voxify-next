import { t } from "@/i18n";
import { LLMType } from "@/types/llm";

export interface LLMServiceForStream {
  type: LLMType;
  baseUrl: string;
  apiKey: string | null;
  model: string;
  settings: { temperature?: number } | null;
}

export interface StreamLLMTextParams {
  service: LLMServiceForStream;
  systemPrompt: string;
  userText: string;
  /**
   * Per-model output cap. When unset, OpenAI-compatible / Ollama / Google
   * requests omit the field entirely (provider default applies); Anthropic
   * falls back to 8192 because its API requires `max_tokens`.
   */
  maxOutputTokens?: number;
  signal: AbortSignal;
  onChunk: (chunk: string) => void;
}

const ANTHROPIC_DEFAULT_MAX_TOKENS = 8192;

export async function streamLLMText(params: StreamLLMTextParams): Promise<void> {
  switch (params.service.type) {
    case LLMType.OpenAI:
    case LLMType.DeepSeek:
      return streamOpenAICompatible(params);
    case LLMType.Anthropic:
      return streamAnthropic(params);
    case LLMType.Ollama:
      return streamOllama(params);
    case LLMType.GoogleGenerativeAI:
      return streamGoogle(params);
    default:
      throw new Error(t("Unknown LLM service type"));
  }
}

async function streamOpenAICompatible({
  service,
  systemPrompt,
  userText,
  maxOutputTokens,
  signal,
  onChunk,
}: StreamLLMTextParams): Promise<void> {
  const url = `${stripTrailingSlash(service.baseUrl)}/chat/completions`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(service.apiKey ? { Authorization: `Bearer ${service.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: service.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      stream: true,
      ...(service.settings?.temperature != null
        ? { temperature: service.settings.temperature }
        : {}),
      ...(maxOutputTokens != null ? { max_tokens: maxOutputTokens } : {}),
      // Reformatting is structural rewrite — disable thinking to keep
      // streaming responsive and skip reasoning token cost. OpenAI / DeepSeek
      // -compatible servers expect this toggle to be sent explicitly.
      thinking: { type: "disabled" },
    }),
    signal,
  });
  if (!resp.ok || !resp.body) {
    throw new Error(`HTTP ${resp.status}: ${await safeText(resp)}`);
  }
  await readSSE(resp.body, signal, (data) => {
    if (data === "[DONE]") return false;
    try {
      const json = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.delta?.content;
      if (content) onChunk(content);
    } catch {
      // skip malformed chunks
    }
  });
}

async function streamAnthropic({
  service,
  systemPrompt,
  userText,
  maxOutputTokens,
  signal,
  onChunk,
}: StreamLLMTextParams): Promise<void> {
  const url = `${stripTrailingSlash(service.baseUrl)}/v1/messages`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      ...(service.apiKey ? { "x-api-key": service.apiKey } : {}),
    },
    body: JSON.stringify({
      model: service.model,
      max_tokens: maxOutputTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userText }],
      stream: true,
      ...(service.settings?.temperature != null
        ? { temperature: service.settings.temperature }
        : {}),
    }),
    signal,
  });
  if (!resp.ok || !resp.body) {
    throw new Error(`HTTP ${resp.status}: ${await safeText(resp)}`);
  }
  await readSSE(resp.body, signal, (data) => {
    try {
      const json = JSON.parse(data) as {
        type?: string;
        delta?: { type?: string; text?: string };
      };
      if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
        const text = json.delta.text;
        if (text) onChunk(text);
      }
    } catch {
      // skip malformed chunks
    }
  });
}

async function streamOllama({
  service,
  systemPrompt,
  userText,
  maxOutputTokens,
  signal,
  onChunk,
}: StreamLLMTextParams): Promise<void> {
  const url = `${stripTrailingSlash(service.baseUrl)}/api/chat`;
  const ollamaOptions: Record<string, number> = {};
  if (service.settings?.temperature != null) {
    ollamaOptions.temperature = service.settings.temperature;
  }
  if (maxOutputTokens != null) {
    ollamaOptions.num_predict = maxOutputTokens;
  }
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: service.model,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      ...(Object.keys(ollamaOptions).length > 0 ? { options: ollamaOptions } : {}),
    }),
    signal,
  });
  if (!resp.ok || !resp.body) {
    throw new Error(`HTTP ${resp.status}: ${await safeText(resp)}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    if (signal.aborted) {
      reader.cancel().catch(() => {});
      throw new DOMException("Aborted", "AbortError");
    }
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const json = JSON.parse(trimmed) as {
          message?: { content?: string };
          done?: boolean;
        };
        const content = json.message?.content;
        if (content) onChunk(content);
        if (json.done) return;
      } catch {
        // skip malformed lines
      }
    }
  }
}

async function streamGoogle({
  service,
  systemPrompt,
  userText,
  maxOutputTokens,
  signal,
  onChunk,
}: StreamLLMTextParams): Promise<void> {
  const params = service.apiKey ? `?alt=sse&key=${encodeURIComponent(service.apiKey)}` : "?alt=sse";
  const url = `${stripTrailingSlash(service.baseUrl)}/v1beta/models/${encodeURIComponent(service.model)}:streamGenerateContent${params}`;
  const generationConfig: Record<string, number> = {};
  if (service.settings?.temperature != null) {
    generationConfig.temperature = service.settings.temperature;
  }
  if (maxOutputTokens != null) {
    generationConfig.maxOutputTokens = maxOutputTokens;
  }
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig,
    }),
    signal,
  });
  if (!resp.ok || !resp.body) {
    throw new Error(`HTTP ${resp.status}: ${await safeText(resp)}`);
  }
  await readSSE(resp.body, signal, (data) => {
    try {
      const json = JSON.parse(data) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) onChunk(text);
    } catch {
      // skip malformed chunks
    }
  });
}

async function readSSE(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onData: (data: string) => boolean | undefined,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    if (signal.aborted) {
      reader.cancel().catch(() => {});
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
        const result = onData(data);
        if (result === false) return;
      }
      idx = buf.indexOf("\n\n");
    }
  }
}

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

async function safeText(resp: Response): Promise<string> {
  try {
    const text = await resp.text();
    return text.slice(0, 200);
  } catch {
    return "";
  }
}
