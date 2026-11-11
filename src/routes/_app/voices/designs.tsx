import { createFileRoute } from "@tanstack/react-router";
import VoiceDesignsTab from "@/components/voices/voice-designs-tab";

export const Route = createFileRoute("/_app/voices/designs")({
  component: VoiceDesignsTab,
});
