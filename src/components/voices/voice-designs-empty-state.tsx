import { t } from "@/i18n";
export default function VoiceDesignsEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-20 text-content-400">
      <p className="text-sm">{t("Choose Design voice to create your first voice")}</p>
    </div>
  );
}
