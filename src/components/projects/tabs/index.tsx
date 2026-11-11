import ExportPanel from "@/components/projects/tabs/export-panel";
import NarratorsPanel from "@/components/projects/tabs/narrators-panel";
import ScriptPanel from "@/components/projects/tabs/script-panel";
import SegmentsPanel from "@/components/projects/tabs/segments-panel";
import SettingsPanel from "@/components/projects/tabs/settings-panel";
import StatsPanel from "@/components/projects/tabs/stats-panel";
import type { ChapterListItem } from "@/lib/chapters.functions";

export const PROJECT_TABS = [
  "stats",
  "text",
  "generate",
  "narrators",
  "export",
  "settings",
] as const;

export type ProjectTab = (typeof PROJECT_TABS)[number];

// Tabs that render a per-chapter view; we only mount these when a chapter
// is selected. Project-level tabs (stats / narrators / export / settings)
// stay usable even when the project has no chapters yet.
const CHAPTER_REQUIRED_TABS: Record<ProjectTab, boolean> = {
  stats: false,
  text: true,
  generate: true,
  narrators: false,
  export: false,
  settings: false,
};

export function ProjectTabPanel({
  tab,
  projectId,
  chapter,
}: {
  tab: ProjectTab;
  projectId: number;
  chapter: ChapterListItem | null;
}) {
  if (CHAPTER_REQUIRED_TABS[tab] && !chapter) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-content-400">
        还没有章节，请先在左侧创建一个章节
      </div>
    );
  }
  switch (tab) {
    case "stats":
      return <StatsPanel projectId={projectId} />;
    case "narrators":
      return <NarratorsPanel projectId={projectId} />;
    case "export":
      return <ExportPanel projectId={projectId} chapter={chapter} />;
    case "settings":
      return <SettingsPanel projectId={projectId} chapter={chapter} />;
    case "text":
      return <ScriptPanel chapter={chapter as ChapterListItem} />;
    case "generate":
      return <SegmentsPanel chapter={chapter as ChapterListItem} />;
  }
}
