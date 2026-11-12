import { ArrowDownUpIcon, SearchIcon } from "lucide-react";
import Input from "@/components/ui/input";
import Select, { type SelectOption } from "@/components/ui/select";
import Toggle, { ToggleGroup } from "@/components/ui/toggle";
import { t } from "@/i18n";

export type VoicesSortKey = "createdAt" | "name";
export type VoicesEnabledFilter = "all" | "enabled" | "disabled";

const SORT_OPTIONS: SelectOption<VoicesSortKey>[] = [
  {
    value: "createdAt",
    get label() {
      return t("Added at");
    },
  },
  {
    value: "name",
    get label() {
      return t("Name");
    },
  },
];

export default function VoicesToolbar({
  query,
  onQueryChange,
  ttsServiceId,
  onTtsServiceIdChange,
  serviceOptions,
  enabled,
  onEnabledChange,
  sort,
  onSortChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  ttsServiceId: number;
  onTtsServiceIdChange: (value: number) => void;
  serviceOptions: SelectOption<number>[];
  enabled: VoicesEnabledFilter;
  onEnabledChange: (value: VoicesEnabledFilter) => void;
  sort: VoicesSortKey;
  onSortChange: (value: VoicesSortKey) => void;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-content-400/20 bg-base-200 p-3">
      <Select<number>
        options={serviceOptions}
        value={ttsServiceId}
        onChange={onTtsServiceIdChange}
        className="min-w-40"
      />
      <Input
        type="search"
        placeholder={t("Search names or tags…")}
        value={query}
        onChange={onQueryChange}
        icon={<SearchIcon />}
        className="w-50 transition-all focus-within:w-80"
      />
      <ToggleGroup<VoicesEnabledFilter>
        value={enabled}
        onChange={(v) => onEnabledChange(v ?? "all")}
        className="mr-4 ml-auto gap-1"
      >
        <Toggle value="all" size="sm">
          {t("All")}
        </Toggle>
        <Toggle value="enabled" size="sm" variant="success">
          {t("Enable")}
        </Toggle>
        <Toggle value="disabled" size="sm" variant="error">
          {t("Disable")}
        </Toggle>
      </ToggleGroup>
      <Select<VoicesSortKey>
        icon={<ArrowDownUpIcon />}
        options={SORT_OPTIONS}
        value={sort}
        onChange={onSortChange}
        className="min-w-40"
      />
    </div>
  );
}
