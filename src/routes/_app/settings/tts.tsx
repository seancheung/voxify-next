import { createFileRoute } from "@tanstack/react-router";
import TTSServicesSection from "@/components/settings/tts-services-section";

export const Route = createFileRoute("/_app/settings/tts")({
  component: TTSServicesSection,
});
