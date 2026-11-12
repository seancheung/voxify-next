import { t } from "@/i18n";
import { TableHead, TableRow } from "../ui/table";

export default function VoicesHeaderRow() {
  return (
    <TableRow>
      <TableHead className="w-1/4">{t("Name")}</TableHead>
      <TableHead className="w-40">{t("Service")}</TableHead>
      <TableHead>{t("Tags")}</TableHead>
      <TableHead className="w-px">{t("Actions")}</TableHead>
    </TableRow>
  );
}
