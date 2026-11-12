import { t } from "@/i18n";
import { TableHead, TableRow } from "../ui/table";

export default function VoiceDesignsHeaderRow() {
  return (
    <TableRow>
      <TableHead className="w-1/3">{t("Name")}</TableHead>
      <TableHead className="w-40">{t("Service")}</TableHead>
      <TableHead className="w-32">{t("Status")}</TableHead>
      <TableHead className="w-px">{t("Actions")}</TableHead>
    </TableRow>
  );
}
