import { createFileRoute } from "@tanstack/react-router";
import VoicesTab, {
  VOICES_ALL_SERVICES,
  VOICES_DEFAULT_ENABLED,
  VOICES_DEFAULT_SORT,
  voicesQueryOptions,
} from "@/components/voices/voices-tab";

export const Route = createFileRoute("/_app/voices/preset")({
  loader: ({ context }) =>
    context.queryClient.ensureInfiniteQueryData(
      voicesQueryOptions({
        sort: VOICES_DEFAULT_SORT,
        enabled: VOICES_DEFAULT_ENABLED,
        search: "",
        ttsServiceId: VOICES_ALL_SERVICES,
      }),
    ),
  component: VoicesTab,
});
