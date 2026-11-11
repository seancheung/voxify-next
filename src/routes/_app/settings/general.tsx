import { createFileRoute } from "@tanstack/react-router";
import GeneralSection from "@/components/settings/general-section";

export const Route = createFileRoute("/_app/settings/general")({
  component: GeneralSection,
});
