export type ExportScope = "chapter" | "all-merged" | "all-split";
export type ExportFormat = "mp3" | "wav" | "m4b";
export type ExportBitrate = 64 | 96 | 128 | 192 | 320;
export type ExportSampleRate = 44100 | 48000;
export type SubtitleFormat = "srt" | "vtt";

/**
 * Target integrated loudness in LUFS for `loudnorm` normalization.
 * `null` skips normalization entirely.
 *
 * Common presets:
 * - -16: podcasts / streaming (Spotify, Apple Podcasts)
 * - -19: ACX audiobook (Audible)
 * - -23: EBU R128 broadcast
 */
export type ExportNormalizeLufs = -16 | -19 | -23 | null;

export interface ExportSettingsSnapshot {
  scope: ExportScope;
  format: ExportFormat;
  bitrate: ExportBitrate;
  sampleRate: ExportSampleRate;
  mono: boolean;
  /** Loudness normalization target; null = disabled. */
  normalizeLufs: ExportNormalizeLufs;
  subtitles: SubtitleFormat[];
  /** Resolved values used for the actual render (project override > global). */
  segmentGapMs: number;
  chapterGapMs: number;
  chapterId?: number;
  chapterName?: string;
}
