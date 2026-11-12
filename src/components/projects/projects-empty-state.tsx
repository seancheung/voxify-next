import { PlusIcon } from "lucide-react";
import { t } from "@/i18n";
import Button from "../ui/button";

export default function ProjectsEmptyState({
  hasFilters,
  onCreate,
}: {
  hasFilters: boolean;
  onCreate: () => void;
}) {
  if (hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-20 text-content-400">
        <p className="text-sm">{t("No matching projects")}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-content-400">
      <p className="text-sm">{t("Create your first project to get started")}</p>
      <Button onClick={onCreate}>
        <PlusIcon />
        {t("New project")}
      </Button>
    </div>
  );
}
