import { ArrowDownUpIcon, SearchIcon } from "lucide-react";
import Input from "@/components/ui/input";
import Select, { type SelectOption } from "@/components/ui/select";
import Toggle, { ToggleGroup } from "@/components/ui/toggle";

export type ProjectsSortKey = "lastOpenedAt" | "createdAt" | "name";
export type ProjectsStatusFilter = "all" | "completed" | "incomplete";

const SORT_OPTIONS: SelectOption<ProjectsSortKey>[] = [
  { value: "lastOpenedAt", label: "最近打开" },
  { value: "createdAt", label: "最近创建" },
  { value: "name", label: "名称" },
];

export default function ProjectsToolbar({
  query,
  onQueryChange,
  status,
  onStatusChange,
  sort,
  onSortChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  status: ProjectsStatusFilter;
  onStatusChange: (value: ProjectsStatusFilter) => void;
  sort: ProjectsSortKey;
  onSortChange: (value: ProjectsSortKey) => void;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-content-400/20 bg-base-200 p-3">
      <Input
        type="search"
        placeholder="搜索名称或作者…"
        value={query}
        onChange={onQueryChange}
        icon={<SearchIcon />}
        className="w-50 transition-all focus-within:w-80"
      />
      <ToggleGroup<ProjectsStatusFilter>
        value={status}
        onChange={(v) => onStatusChange(v ?? "all")}
        className="mr-4 ml-auto gap-1"
      >
        <Toggle value="all" size="sm">
          全部
        </Toggle>
        <Toggle value="completed" size="sm" variant="success">
          已完成
        </Toggle>
        <Toggle value="incomplete" size="sm" variant="info">
          未完成
        </Toggle>
      </ToggleGroup>
      <Select<ProjectsSortKey>
        icon={<ArrowDownUpIcon />}
        options={SORT_OPTIONS}
        value={sort}
        onChange={onSortChange}
        className="min-w-40"
      />
    </div>
  );
}
