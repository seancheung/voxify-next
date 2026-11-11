import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import PageHeader from "@/components/page-header";
import Tabs from "@/components/ui/tab";

type VoicesTabPath = "/voices/preset" | "/voices/designs";

const TAB_ITEMS: { value: VoicesTabPath; label: string }[] = [
  { value: "/voices/preset", label: "预置" },
  { value: "/voices/designs", label: "设计" },
];

export const Route = createFileRoute("/_app/voices")({
  component: VoicesLayout,
});

function VoicesLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active: VoicesTabPath =
    TAB_ITEMS.find((t) => pathname.startsWith(t.value))?.value ?? "/voices/preset";

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader title="声音" />
      <Tabs<VoicesTabPath>
        items={TAB_ITEMS}
        value={active}
        onChange={(value) => navigate({ to: value })}
        className="mb-6"
      />
      <Outlet />
    </div>
  );
}
