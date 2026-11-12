import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import {
  type LucideIcon,
  MessageSquareTextIcon,
  ServerIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import PageHeader from "@/components/page-header";
import { t } from "@/i18n";

const SECTIONS: ReadonlyArray<{
  to:
    | "/settings/general"
    | "/settings/tts"
    | "/settings/llm"
    | "/settings/prompts"
    | "/settings/recycle-bin";
  label: string;
  icon: LucideIcon;
}> = [
  {
    to: "/settings/general",
    get label() {
      return t("General");
    },
    icon: SlidersHorizontalIcon,
  },
  {
    to: "/settings/tts",
    get label() {
      return t("TTS services");
    },
    icon: ServerIcon,
  },
  {
    to: "/settings/llm",
    get label() {
      return t("LLM services");
    },
    icon: SparklesIcon,
  },
  {
    to: "/settings/prompts",
    get label() {
      return t("Prompt");
    },
    icon: MessageSquareTextIcon,
  },
  {
    to: "/settings/recycle-bin",
    get label() {
      return t("Recycle bin");
    },
    icon: Trash2Icon,
  },
];

export const Route = createFileRoute("/_app/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader title={t("Settings")} />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label={t("Settings sections")} className="md:sticky md:top-20 md:self-start">
          <ul className="flex flex-col gap-1">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <li key={s.to}>
                  <Link
                    to={s.to}
                    className="flex has-icon-4 w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors"
                    activeProps={{
                      className: "bg-base-300 text-content-100",
                    }}
                    inactiveProps={{
                      className: "text-content-300 hover:bg-base-300/60 hover:text-content-200",
                    }}
                  >
                    <Icon />
                    {s.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
