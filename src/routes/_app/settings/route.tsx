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
  { to: "/settings/general", label: "通用", icon: SlidersHorizontalIcon },
  { to: "/settings/tts", label: "TTS 服务", icon: ServerIcon },
  { to: "/settings/llm", label: "LLM 服务", icon: SparklesIcon },
  { to: "/settings/prompts", label: "提示词", icon: MessageSquareTextIcon },
  { to: "/settings/recycle-bin", label: "回收站", icon: Trash2Icon },
];

export const Route = createFileRoute("/_app/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader title="设置" description="项目全局默认值与外部服务配置" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="设置分区" className="md:sticky md:top-20 md:self-start">
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
