import { useEffect, useState } from "react";
import SectionCard from "@/components/settings/section-card";
import Select from "@/components/ui/select";
import { getLanguagePreference, type LanguagePreference, setLanguagePreference, t } from "@/i18n";
import messages from "@/i18n-messages.json";

export default function InterfaceLanguageSection() {
  const [preference, setPreference] = useState<LanguagePreference | null>(null);
  useEffect(() => setPreference(getLanguagePreference()), []);
  return (
    <SectionCard title={t("Interface language")}>
      <Select<LanguagePreference>
        aria-label={t("Interface language")}
        value={preference ?? "system"}
        disabled={preference === null}
        onChange={setLanguagePreference}
        options={[
          { value: "system", label: t("Use system language") },
          { value: "en", label: "English" },
          { value: "zh-CN", label: messages["Simplified Chinese"] },
        ]}
      />
    </SectionCard>
  );
}
