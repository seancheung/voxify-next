import type { CSSProperties } from "react";
import { cn } from "@/utils/cn";
import { nameHashHue } from "@/utils/color";

export default function ProjectCover({
  name,
  projectId,
  coverFileId,
  className,
}: {
  name: string;
  projectId?: number;
  coverFileId?: number | null;
  className?: string;
}) {
  if (coverFileId != null && projectId != null) {
    // The route resolves the file by `projects.coverFileId`, but we still
    // append the file id as a cache-bust so a cover swap forces a refetch.
    const src = `/api/projects/${projectId}/cover?v=${coverFileId}`;
    return <img src={src} alt={name} className={cn("size-full object-cover", className)} />;
  }

  const hue = nameHashHue(name);
  const accent = `hsl(${hue} 70% 65%)`;
  const style: CSSProperties = {
    background: `linear-gradient(135deg, hsl(${hue} 55% 28%), hsl(${hue} 70% 8%))`,
  };

  return (
    <div
      role="img"
      aria-label={name}
      className={cn("relative size-full overflow-hidden", className)}
      style={style}
    >
      <span className="absolute inset-y-0 left-0 w-0.5 bg-black/40" aria-hidden="true" />
      <span
        className="absolute top-2 right-1.5 bottom-2 left-1.5 rounded-[1px] border opacity-30"
        style={{ borderColor: accent }}
        aria-hidden="true"
      />
      <div
        className="absolute top-[26%] right-[18%] left-[18%] flex flex-col gap-0.75"
        aria-hidden="true"
      >
        <span
          className="h-[1.5px] w-full rounded-[1px] opacity-90"
          style={{ backgroundColor: accent }}
        />
        <span
          className="h-[1.5px] w-[70%] rounded-[1px] opacity-70"
          style={{ backgroundColor: accent }}
        />
        <span
          className="h-[1.5px] w-[85%] rounded-[1px] opacity-60"
          style={{ backgroundColor: accent }}
        />
      </div>
    </div>
  );
}
