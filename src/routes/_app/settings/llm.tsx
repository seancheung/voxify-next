import { createFileRoute } from "@tanstack/react-router";
import LLMModelsSection from "@/components/settings/llm-models-section";
import LLMServicesSection from "@/components/settings/llm-services-section";

export const Route = createFileRoute("/_app/settings/llm")({
  component: LLMSettings,
});

function LLMSettings() {
  return (
    <div className="flex flex-col gap-6">
      <LLMServicesSection />
      <LLMModelsSection />
    </div>
  );
}
