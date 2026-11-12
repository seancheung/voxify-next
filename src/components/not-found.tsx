import { t } from "@/i18n";
export default function NotFound() {
  return (
    <div className="flex h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-lg">{t("Page not found")}</p>
    </div>
  );
}
