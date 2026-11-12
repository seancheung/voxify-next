import { useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import { t } from "@/i18n";

export type PreviewPlayer = {
  playingId: string | null;
  isLoading: boolean;
  /**
   * Toggle playback for `id`. The url can be a string or an async resolver
   * (the latter lets callers fetch the audio URL on demand and skip the
   * round-trip while playback is already running for the same id).
   * `onEnded` fires only on natural playback end, not on manual stop or
   * load/play errors — useful for chaining continuous playback.
   */
  toggle: (
    id: string,
    url: string | (() => Promise<string>),
    opts?: { onEnded?: () => void },
  ) => void;
  stop: () => void;
};

export function usePreviewPlayer(): PreviewPlayer {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const soundRef = useRef<HTMLAudioElement | null>(null);
  const currentIdRef = useRef<string | null>(null);

  function stop() {
    soundRef.current?.pause();
    soundRef.current = null;
    currentIdRef.current = null;
    setPlayingId(null);
    setIsLoading(false);
  }

  async function toggle(
    id: string,
    url: string | (() => Promise<string>),
    opts?: { onEnded?: () => void },
  ) {
    if (currentIdRef.current === id) {
      stop();
      return;
    }
    soundRef.current?.pause();
    soundRef.current = null;
    currentIdRef.current = id;
    setIsLoading(true);

    let resolved: string;
    try {
      resolved = typeof url === "string" ? url : await url();
    } catch (err) {
      if (currentIdRef.current !== id) return;
      toast.error({
        title: t("Failed to load preview"),
        description: err instanceof Error ? err.message : String(err),
      });
      stop();
      return;
    }
    if (currentIdRef.current !== id) return;

    const sound = new Audio(resolved);
    soundRef.current = sound;
    sound.onplaying = () => {
      if (soundRef.current === sound) {
        setPlayingId(id);
        setIsLoading(false);
      }
    };
    sound.onended = () => {
      if (soundRef.current === sound) {
        stop();
        opts?.onEnded?.();
      }
    };
    const failed = () => {
      if (soundRef.current === sound) {
        toast.error({ title: t("Preview playback failed") });
        stop();
      }
    };
    sound.onerror = failed;
    await sound.play().catch(failed);
  }

  useEffect(() => {
    return () => {
      soundRef.current?.pause();
      soundRef.current = null;
      currentIdRef.current = null;
    };
  }, []);

  return { playingId, isLoading, toggle, stop };
}
