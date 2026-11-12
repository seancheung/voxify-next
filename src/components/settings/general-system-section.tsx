import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckIcon, XIcon } from "lucide-react";
import SectionCard from "@/components/settings/section-card";
import Alert from "@/components/ui/alert";
import Badge from "@/components/ui/badge";
import { t } from "@/i18n";
import { type FFToolInfo, getSystemInfo, type RequiredEncoder } from "@/lib/system.functions";
import { cn } from "@/utils/cn";

export default function GeneralSystemSection() {
  const fetchSystem = useServerFn(getSystemInfo);
  const { data: system, isLoading } = useQuery({
    queryKey: ["system-info"],
    queryFn: () => fetchSystem(),
  });

  return (
    <SectionCard
      title={t("System dependencies")}
      description={t("Export and transcoding use ffmpeg and ffprobe")}
    >
      {isLoading || !system ? (
        <div className="text-sm text-content-300">{t("Checking…")}</div>
      ) : (
        <div className="flex flex-col gap-4">
          {!system.ffmpeg.installed && (
            <Alert variant="warning" title={t("ffmpeg not found")}>
              {t(
                "Install ffmpeg and make it available on PATH to enable audio export and transcoding.",
              )}
            </Alert>
          )}
          {!system.ffprobe.installed && (
            <Alert variant="warning" title={t("ffprobe not found")}>
              {t("Install ffprobe to read audio durations and metadata.")}
            </Alert>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <ToolCard name="ffmpeg" info={system.ffmpeg} showEncoders />
            <ToolCard name="ffprobe" info={system.ffprobe} />
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function ToolCard({
  name,
  info,
  showEncoders = false,
}: {
  name: string;
  info: FFToolInfo;
  showEncoders?: boolean;
}) {
  return (
    <div className="rounded-md border border-content-400/15 bg-base-300 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-lg text-content-100">{name}</span>
        <Badge size="sm" rounded variant={info.installed ? "success" : "error"}>
          {info.installed ? <CheckIcon /> : <XIcon />}
          {info.installed ? t("Available") : t("Not installed")}
        </Badge>
      </div>
      <dl className="mt-3 space-y-1.5 text-xs">
        <Row label={t("Path")} value={info.path ?? "—"} mono />
        <Row label={t("Version")} value={info.version ?? "—"} mono />
      </dl>
      {showEncoders && (
        <div className="mt-3 border-t border-content-400/15 pt-3">
          <div className="mb-1.5 text-xs text-content-300">{t("Audio encoders")}</div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(info.encoders) as RequiredEncoder[]).map((enc) => (
              <EncoderBadge key={enc} name={enc} ok={info.encoders[enc]} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-12 shrink-0 text-content-300">{label}</dt>
      <dd
        className={cn("min-w-0 flex-1 truncate text-content-200", mono && "font-mono")}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function EncoderBadge({ name, ok }: { name: string; ok: boolean }) {
  return (
    <Badge variant={ok ? "success" : "error"} bordered>
      {ok ? <CheckIcon /> : <XIcon />}
      {name}
    </Badge>
  );
}
