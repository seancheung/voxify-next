export enum LLMType {
  OpenAI,
  Anthropic,
  GoogleGenerativeAI,
  Ollama,
  DeepSeek,
}

export interface LLMSettings {
  temperature?: number;
  maxOutputTokens?: number;
}

export interface LLMModelMetadata {
  contextWindow?: number;
}
