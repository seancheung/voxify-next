import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import PageHeader from "@/components/page-header";
import Tabs from "@/components/ui/tab";
import { t } from "@/i18n";

type VoicesTabPath = "/voices/preset" | "/voices/designs";

const TAB_ITEMS: { value: VoicesTabPath; label: string }[] = [
  {
    value: "/voices/preset",
    get label() {
      return t("Presets");
    },
  },
  {
    value: "/voices/designs",
    get label() {
      return t("Designs");
    },
  },
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
      <PageHeader title={t("Voice")} />
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
