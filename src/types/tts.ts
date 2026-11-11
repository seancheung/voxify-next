export enum TTSServiceType {
  OpenTTS,
  OpenAITTS,
}

export interface TTSCapabilities {
  speech?: boolean;
  clone?: boolean;
  design?: boolean;
  realtime?: boolean;
  streaming?: boolean;
  languages?: boolean | string[];
  builtin_voices?: boolean;
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type CustomArgs = Record<string, JsonValue>;

export interface VoiceSettings {
  speed?: string;
  instructions?: string;
  customArgs?: CustomArgs;
}

export interface TTSSettings extends VoiceSettings {
  model?: string;
  responseFormat?: string;
  timeout?: number;
  [k: string]: unknown;
}

export interface VoiceMetadata {
  name?: string;
  gender?: string;
  age?: string;
  language?: string;
  description?: string;
  tags?: string[];
  [k: string]: unknown;
}

export interface TTSPayload extends VoiceSettings {
  input: string;
  voice: string;
  model?: string;
  responseFormat?: string;
}
