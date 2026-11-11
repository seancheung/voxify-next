import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckIcon, XIcon } from "lucide-react";
import SectionCard from "@/components/settings/section-card";
import Alert from "@/components/ui/alert";
import Badge from "@/components/ui/badge";
import { type FFToolInfo, getSystemInfo, type RequiredEncoder } from "@/lib/system.functions";
import { cn } from "@/utils/cn";

export default function GeneralSystemSection() {
  const fetchSystem = useServerFn(getSystemInfo);
  const { data: system, isLoading } = useQuery({
    queryKey: ["system-info"],
    queryFn: () => fetchSystem(),
  });

  return (
    <SectionCard title="系统依赖" description="导出 / 转码功能依赖系统中的 ffmpeg 与 ffprobe">
      {isLoading || !system ? (
        <div className="text-sm text-content-300">检测中…</div>
      ) : (
        <div className="flex flex-col gap-4">
          {!system.ffmpeg.installed && (
            <Alert variant="warning" title="未检测到 ffmpeg">
              请安装 ffmpeg 并确保命令行可执行；否则音频导出与转码功能不可用。
            </Alert>
          )}
          {!system.ffprobe.installed && (
            <Alert variant="warning" title="未检测到 ffprobe">
              请安装 ffprobe 以便解析音频时长 / 元数据。
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
          {info.installed ? "可用" : "未安装"}
        </Badge>
      </div>
      <dl className="mt-3 space-y-1.5 text-xs">
        <Row label="路径" value={info.path ?? "—"} mono />
        <Row label="版本" value={info.version ?? "—"} mono />
      </dl>
      {showEncoders && (
        <div className="mt-3 border-t border-content-400/15 pt-3">
          <div className="mb-1.5 text-xs text-content-300">音频编码器</div>
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
