import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDownIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useAutoSubmit } from "@/components/form";
import VoicePickerDialog from "@/components/voices/voice-picker-dialog";
import { getVoicesByIds, type VoiceListItem } from "@/lib/voices.functions";
import { cn } from "@/utils/cn";

export type VoiceSelectProps = {
  value: number | null;
  onChange: (value: number | null, voice: VoiceListItem | null) => void;
  placeholder?: string;
  dialogTitle?: string;
  dialogDescription?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
};

export default function VoiceSelect({
  value,
  onChange,
  placeholder = "请选择…",
  dialogTitle,
  dialogDescription,
  clearable = true,
  disabled,
  className,
}: VoiceSelectProps) {
  const [open, setOpen] = useState(false);
  const fetchVoicesByIds = useServerFn(getVoicesByIds);
  const autoSubmit = useAutoSubmit();

  function commit(id: number | null, picked: VoiceListItem | null) {
    onChange(id, picked);
    autoSubmit?.();
  }

  // Cached lookup so the trigger label can show name + service even when only
  // an id was passed in. Keyed on the id so switching values doesn't flash.
  const { data: voice = null } = useQuery({
    queryKey: ["voice-by-id", value] as const,
    queryFn: async (): Promise<VoiceListItem | null> => {
      if (value == null) return null;
      const rows = await fetchVoicesByIds({ data: { ids: [value] } });
      return rows[0] ?? null;
    },
    enabled: value != null,
    staleTime: 5 * 60_000,
  });

  const showClear = clearable && !disabled && value != null;

  return (
    <>
      <button
        type="button"
        disabled={disabled ?? false}
        onClick={() => setOpen(true)}
        className={cn(
          "group inline-flex h-8 w-full cursor-pointer items-center gap-2 rounded-md border border-content-400/50 bg-base-100 px-3 text-sm text-content-200 transition-all outline-none",
          "hover:border-content-400/80 focus-visible:border-primary-500 focus-visible:ring-3 focus-visible:ring-primary-500/10",
          "disabled:cursor-not-allowed disabled:opacity-40",
          className,
        )}
      >
        {value != null ? (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-content-200">{voice?.name ?? "…"}</span>
            {voice?.ttsServiceName && (
              <span className="truncate text-xs text-content-300">{voice.ttsServiceName}</span>
            )}
          </span>
        ) : (
          <span className="flex-1 text-left text-content-400">{placeholder}</span>
        )}
        {showClear ? (
          <span className="relative inline-flex size-3.5 shrink-0 items-center justify-center">
            <ChevronDownIcon className="absolute size-full text-content-400 transition group-hover:opacity-0" />
            <span
              role="button"
              tabIndex={-1}
              aria-label="清除"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                commit(null, null);
              }}
              className="absolute inset-0 inline-flex cursor-pointer items-center justify-center text-content-400 opacity-0 transition group-hover:opacity-100 hover:text-content-200"
            >
              <XIcon className="size-full" />
            </span>
          </span>
        ) : (
          <ChevronDownIcon className="size-3.5 shrink-0 text-content-400" />
        )}
      </button>
      <VoicePickerDialog
        open={open}
        onOpenChange={setOpen}
        value={value}
        onChange={commit}
        title={dialogTitle}
        description={dialogDescription}
      />
    </>
  );
}
