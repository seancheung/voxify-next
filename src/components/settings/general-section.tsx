import GeneralDefaultsSection from "@/components/settings/general-defaults-section";
import GeneralStatsSection, {
  TaskManagementSection,
} from "@/components/settings/general-stats-section";
import GeneralSystemSection from "@/components/settings/general-system-section";

export default function GeneralSection() {
  return (
    <div className="flex flex-col gap-8">
      <GeneralDefaultsSection />
      <GeneralSystemSection />
      <GeneralStatsSection />
      <TaskManagementSection />
    </div>
  );
}
