import { PlayIcon, RepeatIcon, ScissorsIcon, SquareIcon, VolumeXIcon } from "lucide-react";
import { type PointerEvent, useEffect, useEffectEvent, useRef, useState } from "react";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import Tooltip from "@/components/ui/tooltip";
import { saveEditedAudio } from "@/lib/segment-audio.functions";
import { getSegmentGenerationUrl } from "@/lib/segments.functions";
import { editSelection, encodeWav } from "@/utils/segment-audio";

export default function SegmentAudioDialog({
  segmentId,
  generationId,
  onClose,
  onSaved,
}: {
  segmentId: number;
  generationId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [audio, setAudio] = useState<AudioBuffer | null>(null);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const context = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const anchor = useRef<number | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const wave = useRef<HTMLDivElement>(null);
  const pan = useRef<{ x: number; origin: number } | null>(null);
  const raf = useRef(0);
  const request = useRef(0);
  const [cursor, setCursor] = useState(0);
  const [view, setView] = useState({ origin: 0, zoom: 1 });
  const total = audio?.length ?? 1;
  const span = Math.max(1, Math.round(total / view.zoom));
  const origin = Math.min(total - span, view.origin);
  const [start, end] = range;
  const selected = end > start;

  useEffect(() => {
    const abort = new AbortController();
    async function load() {
      const ctx = new AudioContext();
      context.current = ctx;
      const { url } = await getSegmentGenerationUrl({ data: { id: generationId } });
      const response = await fetch(url, { signal: abort.signal });
      if (!response.ok) throw new Error("音频加载失败");
      const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
      if (!abort.signal.aborted) setAudio(buffer);
    }
    load().catch((err) => {
      if (!abort.signal.aborted) setError(String(err));
    });
    return () => {
      abort.abort();
      request.current++;
      cancelAnimationFrame(raf.current);
      if (source.current) source.current.onended = null;
      void context.current?.close();
      context.current = null;
    };
  }, [generationId]);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!audio || !ctx) return;
    const { width, height } = ctx.canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = getComputedStyle(ctx.canvas).color;
    const channels = Array.from({ length: audio.numberOfChannels }, (_, i) =>
      audio.getChannelData(i),
    );
    for (let x = 0; x < width; x++) {
      let peak = 0;
      const from = origin + Math.floor((x * span) / width);
      const to = Math.min(
        audio.length,
        Math.max(from + 1, origin + Math.floor(((x + 1) * span) / width)),
      );
      for (const channel of channels) {
        for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(channel[i]));
      }
      ctx.fillRect(x, (height * (1 - peak)) / 2, 1, Math.max(1, height * peak));
    }
  }, [audio, origin, span]);

  useEffect(() => {
    const el = wave.current;
    if (!el || !audio) return;
    function zoom(e: WheelEvent) {
      e.preventDefault();
      if (saving || !el || !e.deltaY) return;
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setView((prev) => {
        const zoom = Math.max(
          1,
          Math.min(Math.max(1, total / 32), prev.zoom * (e.deltaY < 0 ? 1.4 : 1 / 1.4)),
        );
        const before = Math.round(total / prev.zoom);
        const after = Math.round(total / zoom);
        return {
          zoom,
          origin: Math.max(
            0,
            Math.min(
              total - after,
              Math.round(Math.min(total - before, prev.origin) + ratio * (before - after)),
            ),
          ),
        };
      });
    }
    el.addEventListener("wheel", zoom, { passive: false });
    return () => el.removeEventListener("wheel", zoom);
  }, [audio, total, saving]);

  function frame(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.round(
      origin + Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * span,
    );
  }

  function stop() {
    request.current++;
    cancelAnimationFrame(raf.current);
    if (source.current) {
      source.current.onended = null;
      source.current.stop();
      source.current = null;
    }
    setPlaying(false);
  }

  async function preview(from: number, to: number, loop = false) {
    const ctx = context.current;
    if (!ctx || !audio || from >= to) return;
    stop();
    const token = request.current;
    try {
      await ctx.resume();
      if (ctx !== context.current || token !== request.current) return;
      const node = ctx.createBufferSource();
      source.current = node;
      node.buffer = audio;
      node.connect(ctx.destination);
      node.onended = () => {
        cancelAnimationFrame(raf.current);
        setCursor(to);
        source.current = null;
        setPlaying(false);
      };
      const rate = audio.sampleRate;
      const began = ctx.currentTime;
      node.loop = loop;
      node.loopStart = from / rate;
      node.loopEnd = to / rate;
      if (loop) node.start(began, from / rate);
      else node.start(began, from / rate, (to - from) / rate);
      const tick = () => {
        const elapsed = Math.max(0, Math.floor((ctx.currentTime - began) * rate));
        const frame = from + (loop ? elapsed % (to - from) : Math.min(elapsed, to - from));
        setCursor(frame);
        setView((prev) => {
          const width = Math.max(1, Math.round(total / prev.zoom));
          const left = Math.min(total - width, prev.origin);
          if (frame >= left && frame <= left + width) return prev;
          return { ...prev, origin: Math.min(total - width, frame) };
        });
        raf.current = requestAnimationFrame(tick);
      };
      tick();
      setPlaying(true);
    } catch (err) {
      setError(String(err));
    }
  }

  function edit(silence: boolean) {
    if (!audio || !selected) return;
    stop();
    setAudio(editSelection(audio, start, end, silence));
    setRange([start, silence ? end : start]);
    setCursor(start);
    setDirty(true);
  }

  const shortcut = useEffectEvent((e: KeyboardEvent) => {
    if (!audio || saving || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey)
      return;
    if (
      e.target instanceof HTMLElement &&
      e.target.closest("input,textarea,select,[contenteditable=true]")
    )
      return;
    if (e.code !== "Space" && e.key !== "Delete") return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    if (e.key === "Delete") {
      if (selected && end - start < total) edit(false);
    } else if (playing) stop();
    else if (selected) void preview(start, end, true);
    else void preview(cursor, total);
  });
  useEffect(() => {
    const handle = (e: KeyboardEvent) => shortcut(e);
    document.addEventListener("keydown", handle, true);
    return () => document.removeEventListener("keydown", handle, true);
  }, []);

  async function save() {
    if (!audio || saving) return;
    stop();
    setSaving(true);
    setError("");
    try {
      const data = new FormData();
      data.set("segmentId", String(segmentId));
      data.set("generationId", String(generationId));
      data.set("audio", encodeWav(audio), "edited.wav");
      await saveEditedAudio({ data });
      toast.success("已保存为新的音频版本");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      title="编辑音频"
      size="lg"
      closable={!saving}
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
      footer={
        <>
          <Button variant="ghost" disabled={saving} onClick={onClose}>
            取消
          </Button>
          <Button disabled={!dirty || saving} onClick={save}>
            {saving ? "保存中…" : "保存为新版本"}
          </Button>
        </>
      }
    >
      {error && (
        <p role="alert" className="text-error-400 mb-3 text-sm">
          {error}
        </p>
      )}
      {audio ? (
        <fieldset disabled={saving} className="min-w-0 space-y-4">
          <div className="flex justify-between text-xs text-content-300">
            <span>拖动选择 · 滚轮缩放 · 中键拖动平移</span>
            <span>
              {(cursor / audio.sampleRate).toFixed(3)} / {audio.duration.toFixed(3)} 秒
            </span>
          </div>
          <div
            ref={wave}
            tabIndex={-1}
            onAuxClick={(e) => {
              if (e.button === 1) e.preventDefault();
            }}
            className="relative h-28 cursor-crosshair touch-none overflow-hidden rounded-md border border-content-400/30 bg-base-200 select-none focus:outline-none"
            onPointerDown={(event) => {
              if (!event.isPrimary || saving) return;
              if (event.button === 1) {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                pan.current = { x: event.clientX, origin };
                return;
              }
              if (event.button !== 0) return;
              stop();
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
              anchor.current = frame(event);
              setCursor(anchor.current);
              setRange([anchor.current, anchor.current]);
            }}
            onPointerMove={(event) => {
              if (pan.current && event.isPrimary) {
                const delta =
                  ((pan.current.x - event.clientX) * span) / event.currentTarget.clientWidth;
                const origin = Math.round(
                  Math.max(0, Math.min(total - span, pan.current.origin + delta)),
                );
                setView((prev) => ({ ...prev, origin }));
                return;
              }
              if (!event.isPrimary || anchor.current === null) return;
              const next = frame(event);
              setRange([Math.min(anchor.current, next), Math.max(anchor.current, next)]);
            }}
            onLostPointerCapture={() => {
              pan.current = null;
              anchor.current = null;
            }}
          >
            <canvas
              ref={canvas}
              width={1200}
              height={180}
              className="h-full w-full text-primary-400"
            />
            <div
              hidden={!selected}
              className="pointer-events-none absolute inset-y-0 border-x border-primary-400 bg-primary-400/25"
              style={{
                left: `${(100 * (start - origin)) / span}%`,
                width: `${(100 * (end - start)) / span}%`,
              }}
            />
            <div
              className="pointer-events-none absolute inset-y-0 w-px bg-content-100"
              style={{ left: `clamp(0px, ${(100 * (cursor - origin)) / span}%, calc(100% - 1px))` }}
              hidden={cursor < origin || cursor > origin + span}
            />
          </div>
          <div className="flex items-center gap-1">
            <Tooltip content={playing ? "停止（空格）" : "试听全部"}>
              <Button
                variant="ghost"
                size="sm"
                shape="circle"
                aria-label={playing ? "停止" : "试听全部"}
                onClick={() => (playing ? stop() : preview(0, total))}
              >
                {playing ? <SquareIcon /> : <PlayIcon />}
              </Button>
            </Tooltip>
            <Tooltip content="循环试听选区（空格）">
              <span className="inline-flex">
                <Button
                  variant="ghost"
                  size="sm"
                  shape="circle"
                  aria-label="循环试听选区"
                  disabled={!selected}
                  onClick={() => preview(start, end, true)}
                >
                  <RepeatIcon />
                </Button>
              </span>
            </Tooltip>
            <span className="mx-2 h-5 border-l border-content-400/30" />
            <Tooltip content="删除选区（Delete）">
              <span className="inline-flex">
                <Button
                  variant="ghost"
                  size="sm"
                  shape="circle"
                  aria-label="删除选区"
                  disabled={!selected || end - start === total}
                  onClick={() => edit(false)}
                >
                  <ScissorsIcon />
                </Button>
              </span>
            </Tooltip>
            <Tooltip content="静音选区">
              <span className="inline-flex">
                <Button
                  variant="ghost"
                  size="sm"
                  shape="circle"
                  aria-label="静音选区"
                  disabled={!selected}
                  onClick={() => edit(true)}
                >
                  <VolumeXIcon />
                </Button>
              </span>
            </Tooltip>
            <span className="ml-auto text-xs text-content-300">{view.zoom.toFixed(1)}×</span>
          </div>
          <div className="flex flex-wrap gap-4">
            {(["起点（秒）", "终点（秒）"] as const).map((label, i) => (
              <label key={label} className="flex items-center gap-2 text-sm">
                {label}
                <input
                  type="number"
                  step="0.001"
                  min={0}
                  max={Math.ceil(audio.duration * 1000) / 1000}
                  value={Number((range[i] / audio.sampleRate).toFixed(3))}
                  className="w-24 rounded border border-content-400/30 bg-base-200 px-2 py-1"
                  onChange={(event) => {
                    const seconds = event.currentTarget.valueAsNumber;
                    if (!Number.isFinite(seconds)) return;
                    const value = Math.max(
                      0,
                      Math.min(audio.length, Math.round(seconds * audio.sampleRate)),
                    );
                    stop();
                    setCursor(i === 0 ? value : Math.min(value, start));
                    setRange(
                      i === 0 ? [value, Math.max(value, end)] : [Math.min(value, start), value],
                    );
                  }}
                />
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        !error && <p>正在加载音频…</p>
      )}
    </Dialog>
  );
}
