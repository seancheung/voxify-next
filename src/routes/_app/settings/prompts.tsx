import { createFileRoute } from "@tanstack/react-router";
import PromptsSection from "@/components/settings/prompts-section";

export const Route = createFileRoute("/_app/settings/prompts")({
  component: PromptsSection,
});
