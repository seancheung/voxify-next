import { createFileRoute } from "@tanstack/react-router";
import RecycleBinSection from "@/components/settings/recycle-bin-section";

export const Route = createFileRoute("/_app/settings/recycle-bin")({
  component: RecycleBinSection,
});
