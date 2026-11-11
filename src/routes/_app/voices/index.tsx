import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/voices/")({
  beforeLoad: () => {
    throw redirect({ to: "/voices/preset" });
  },
});
