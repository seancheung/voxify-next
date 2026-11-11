import type { CustomArgs } from "@/types/tts";

export interface ProjectSettings {
  locale?: string;
  gap?: number;
  chapterGap?: number;
  voiceSettings?: {
    speed?: string;
    instructions?: string;
    customArgs?: CustomArgs;
  };
}
