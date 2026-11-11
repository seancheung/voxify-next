import {
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlayIcon,
  SquareIcon,
  TrashIcon,
} from "lucide-react";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import Dropdown from "@/components/ui/dropdown";
import Switch from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import type { VoiceListItem } from "@/lib/voices.functions";
import { TTSServiceType } from "@/types/tts";
import { cn } from "@/utils/cn";

export default function VoiceRow({
  voice,
  isPlaying,
  isLoadingAudio,
  onTogglePlay,
  onToggleEnabled,
  onEdit,
  onDelete,
}: {
  voice: VoiceListItem;
  isPlaying: boolean;
  isLoadingAudio: boolean;
  onTogglePlay: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isOpenAI = voice.ttsServiceType === TTSServiceType.OpenAITTS;
  const tags = metadataTags(voice.metadata);

  return (
    <TableRow className={cn(!voice.enabled && "opacity-60")}>
      <TableCell>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-content-100">{voice.name}</span>
          <span className="truncate font-mono text-xs text-content-400">{voice.key}</span>
        </div>
      </TableCell>
      <TableCell className="text-xs text-content-300">{voice.ttsServiceName}</TableCell>
      <TableCell>
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <Badge key={tag} size="sm">
                {tag}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-xs text-content-400">—</span>
        )}
      </TableCell>
      <TableCell>
        <div className="inline-flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            shape="circle"
            onClick={onTogglePlay}
            disabled={!voice.previewUrl || isLoadingAudio}
            aria-label={isPlaying ? "停止" : "试听"}
          >
            {isLoadingAudio ? (
              <Loader2Icon className="animate-spin" />
            ) : isPlaying ? (
              <SquareIcon />
            ) : (
              <PlayIcon />
            )}
          </Button>
          <Switch
            size="sm"
            value={voice.enabled ?? false}
            onChange={onToggleEnabled}
            aria-label={voice.enabled ? "禁用" : "启用"}
          />
          <Dropdown
            align="end"
            items={[
              {
                key: "edit",
                label: "编辑",
                icon: <PencilIcon />,
                disabled: !isOpenAI,
                onSelect: onEdit,
              },
              { type: "separator" },
              {
                key: "delete",
                label: "删除",
                icon: <TrashIcon />,
                danger: true,
                disabled: !isOpenAI,
                onSelect: onDelete,
              },
            ]}
          >
            <Button variant="ghost" size="sm" shape="circle" aria-label="更多操作">
              <MoreHorizontalIcon />
            </Button>
          </Dropdown>
        </div>
      </TableCell>
    </TableRow>
  );
}

function metadataTags(metadata: VoiceListItem["metadata"]): string[] {
  if (!metadata) return [];
  const tags: string[] = [];
  if (metadata.gender) tags.push(String(metadata.gender));
  if (metadata.age) tags.push(String(metadata.age));
  if (metadata.language) tags.push(String(metadata.language));
  if (Array.isArray(metadata.tags)) tags.push(...metadata.tags.map(String));
  return tags;
}
