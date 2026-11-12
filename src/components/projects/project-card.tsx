import { Link } from "@tanstack/react-router";
import {
  BookIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleIcon,
  ClockIcon,
  CopyIcon,
  MoreHorizontalIcon,
  TrashIcon,
} from "lucide-react";
import ProjectCover from "@/components/projects/project-cover";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import Dropdown from "@/components/ui/dropdown";
import Progress from "@/components/ui/progress";
import { t } from "@/i18n";
import type { ProjectListItem } from "@/lib/projects.functions";
import { cn } from "@/utils/cn";
import { relativeTime } from "@/utils/datetime";

export default function ProjectCard({
  project,
  onDelete,
  onDuplicate,
}: {
  project: ProjectListItem;
  onDelete: (id: number) => void;
  onDuplicate: (id: number) => void;
}) {
  const total = project.segmentCount;
  const completed = project.completedSegmentCount;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const completed100 = total > 0 && completed >= total;
  const StatusIcon = completed100
    ? CircleCheckIcon
    : completed > 0
      ? ClockIcon
      : total > 0
        ? CircleIcon
        : CircleDashedIcon;
  const statusText = completed100
    ? t("Complete")
    : completed > 0
      ? t("Incomplete")
      : total > 0
        ? t("Not started")
        : t("Draft");
  const badgeVariant = completed100
    ? "success"
    : completed > 0
      ? "warning"
      : total > 0
        ? "info"
        : "secondary";

  return (
    <article className="group relative flex flex-col rounded-lg border border-content-400/20 bg-base-200 transition-all hover:-translate-y-0.5 hover:border-primary-500/40 hover:shadow-lg">
      <Link
        to="/projects/$id"
        params={{ id: String(project.id) }}
        className="flex flex-col p-5 outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        <div className="flex gap-4">
          <div className="aspect-3/4 w-16 shrink-0 self-start overflow-hidden rounded-sm shadow-md">
            <ProjectCover
              name={project.name}
              projectId={project.id}
              coverFileId={project.coverFileId}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-1">
              <h3 className="truncate text-lg text-content-100">{project.name}</h3>
              <Badge size="sm" variant={badgeVariant}>
                <StatusIcon />
                {statusText}
              </Badge>
            </div>
            <p
              className={cn(
                "mt-0.5 truncate text-xs",
                project.author ? "text-content-300" : "text-content-400/60",
              )}
            >
              {project.author}
            </p>
            <div className="mt-auto pt-4">
              <Progress value={percent} variant={completed100 ? "success" : "primary"} size="sm" />
              <div className="mt-1.5 flex items-baseline justify-between font-mono text-xs">
                <span className="text-content-300">{`${completed} / ${total}`}</span>
                <span
                  className={cn(
                    "font-semibold",
                    completed100 ? "text-success" : "text-content-100",
                  )}
                >
                  {`${percent}%`}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 border-t border-content-400/15 pt-3 text-xs text-content-300">
          <BookIcon className="size-3" />
          <span>{t("{0} chapters", project.chapterCount)}</span>
          <span className="text-content-300/40">·</span>
          <span suppressHydrationWarning>{relativeTime(project.createdAt)}</span>
        </div>
      </Link>
      <div className="absolute right-3 bottom-2.5">
        <Dropdown
          align="end"
          items={[
            {
              key: "duplicate",
              label: t("Duplicate"),
              icon: <CopyIcon />,
              onSelect: () => onDuplicate(project.id),
            },
            { type: "separator" },
            {
              key: "delete",
              label: t("Delete"),
              icon: <TrashIcon />,
              danger: true,
              onSelect: () => onDelete(project.id),
            },
          ]}
        >
          <Button
            variant="ghost"
            size="sm"
            shape="circle"
            aria-label={t("More actions")}
            className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            <MoreHorizontalIcon />
          </Button>
        </Dropdown>
      </div>
    </article>
  );
}
