import {
  DownloadIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlayIcon,
  RefreshCwIcon,
  SquareIcon,
  TrashIcon,
} from "lucide-react";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import Dropdown from "@/components/ui/dropdown";
import { TableCell, TableRow } from "@/components/ui/table";
import { t } from "@/i18n";
import type { VoiceDesignListItem } from "@/lib/voice-designs.functions";
import { cn } from "@/utils/cn";

export default function VoiceDesignRow({
  design,
  isPlaying,
  isLoadingAudio,
  onTogglePlay,
  onDownload,
  onRename,
  onRegenerate,
  onDelete,
}: {
  design: VoiceDesignListItem;
  isPlaying: boolean;
  isLoadingAudio: boolean;
  onTogglePlay: () => void;
  onDownload: () => void;
  onRename: () => void;
  onRegenerate: () => void;
  onDelete: () => void;
}) {
  const isReady = design.status === "ready" && design.fileId != null;
  const isPendingOrRunning = design.status === "pending" || design.status === "running";

  return (
    <TableRow className={cn(isPendingOrRunning && "opacity-80")}>
      <TableCell>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-content-100">{design.name}</span>
          <span className="truncate text-xs text-content-400">{design.instruct}</span>
        </div>
      </TableCell>
      <TableCell className="text-xs text-content-300">
        {design.ttsServiceName ?? <span className="text-content-400">—</span>}
      </TableCell>
      <TableCell>
        <StatusBadge status={design.status} errorMessage={design.errorMessage} />
      </TableCell>
      <TableCell>
        <div className="inline-flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            shape="circle"
            onClick={onTogglePlay}
            disabled={!isReady || isLoadingAudio}
            aria-label={isPlaying ? t("Stop") : t("Preview")}
          >
            {isLoadingAudio ? (
              <Loader2Icon className="animate-spin" />
            ) : isPlaying ? (
              <SquareIcon />
            ) : (
              <PlayIcon />
            )}
          </Button>
          <Dropdown
            align="end"
            items={[
              {
                key: "download",
                label: t("Download"),
                icon: <DownloadIcon />,
                disabled: !isReady,
                onSelect: onDownload,
              },
              {
                key: "rename",
                label: t("Rename"),
                icon: <PencilIcon />,
                onSelect: onRename,
              },
              {
                key: "regenerate",
                label: t("Regenerate"),
                icon: <RefreshCwIcon />,
                disabled: isPendingOrRunning,
                onSelect: onRegenerate,
              },
              { type: "separator" },
              {
                key: "delete",
                label: t("Delete"),
                icon: <TrashIcon />,
                danger: true,
                onSelect: onDelete,
              },
            ]}
          >
            <Button variant="ghost" size="sm" shape="circle" aria-label={t("More actions")}>
              <MoreHorizontalIcon />
            </Button>
          </Dropdown>
        </div>
      </TableCell>
    </TableRow>
  );
}

function StatusBadge({
  status,
  errorMessage,
}: {
  status: VoiceDesignListItem["status"];
  errorMessage: string | null;
}) {
  if (status === "ready") {
    return (
      <Badge size="sm" variant="success">
        {t("Ready")}
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge size="sm" variant="error" title={errorMessage ?? undefined}>
        {t("Failure")}
      </Badge>
    );
  }
  if (status === "running") {
    return (
      <Badge size="sm" variant="info">
        <Loader2Icon className="size-3 animate-spin" />
        {t("Generating")}
      </Badge>
    );
  }
  return (
    <Badge size="sm" variant="secondary">
      {t("Pending")}
    </Badge>
  );
}
