import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import {
  AudioLines,
  Box,
  History,
  Keyboard,
  PanelLeft,
  Settings2,
} from "lucide-react";
import type React from "react";
import { AnimatedBackground } from "@/components/motion-primitives/animated-background";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { AppSettings } from "./settings/app/app-settings";
import { HistorySettings } from "./settings/history/history-settings";
import { KeyboardTrackingSettings } from "./settings/keyboard-tracking/keyboard-tracking-settings";
import { ModelsSettings } from "./settings/models/models-settings";
import { TranscriptionSettings } from "./settings/transcription/transcription-settings";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

const sidebarCollapsedAtom = atomWithStorage("sidebar_collapsed", true);

export type SidebarSection = keyof typeof SECTIONS_CONFIG;

type IconProps = {
  width?: number | string;
  height?: number | string;
  size?: number | string;
  className?: string;
  strokeWidth?: number | string;
};

type SectionConfig = {
  label: string;
  icon: React.ComponentType<IconProps>;
  component: React.ComponentType;
};

export const SECTIONS_CONFIG = {
  app: {
    label: "App Settings",
    icon: Settings2,
    component: AppSettings,
  },
  transcription: {
    label: "Transcription",
    icon: AudioLines,
    component: TranscriptionSettings,
  },
  "keyboard-tracking": {
    label: "Keyboard",
    icon: Keyboard,
    component: KeyboardTrackingSettings,
  },
  models: {
    label: "Models",
    icon: Box,
    component: ModelsSettings,
  },
  history: {
    label: "History",
    icon: History,
    component: HistorySettings,
  },
} as const satisfies Record<string, SectionConfig>;

export const Sidemenu = ({
  activeSection,
  onSectionChange,
}: {
  activeSection: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
}) => {
  const [isCollapsed, setIsCollapsed] = useAtom(sidebarCollapsedAtom);

  const availableSections = Object.entries(SECTIONS_CONFIG).map(
    ([id, config]) => ({ id: id as SidebarSection, ...config })
  );

  return (
    <div className="px-2 pb-2">
      <TooltipProvider delayDuration={0}>
        <div
          className={cn(
            "flex h-full flex-col items-center rounded-2xl border border-foreground/5 bg-foreground/5 p-1 transition-all duration-200",
            isCollapsed ? "w-16 min-w-16" : "w-40 min-w-40"
          )}
          data-tauri-drag-region
        >
          <div className="relative h-8 w-full">
            <Button
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={cn(
                "absolute top-0 rounded-lg transition-all",
                isCollapsed
                  ? "-translate-x-1/2 left-1/2"
                  : "-translate-x-full left-full"
              )}
              onClick={() => setIsCollapsed(!isCollapsed)}
              variant="ghost"
            >
              <PanelLeft
                className={cn("", isCollapsed ? "rotate-180" : "")}
                height={24}
                width={24}
              />
            </Button>
          </div>
          <div className="flex w-full flex-col items-center gap-0 px-1 pt-2">
            <AnimatedBackground
              className="peer w-full rounded-lg bg-foreground/10"
              defaultValue={activeSection}
              enableHover={true}
              transition={{
                type: "spring",
                bounce: 0.2,
                duration: 0.3,
              }}
            >
              {availableSections.map((section) => {
                const Icon = section.icon;

                const button = (
                  <button
                    className={cn("w-full cursor-pointer")}
                    data-id={section.id}
                    key={section.id}
                    onClick={() => onSectionChange(section.id)}
                    type="button"
                  >
                    <div className="flex size-full h-10 w-full items-center gap-2 px-3">
                      <Icon className="size-4" strokeWidth={2} />

                      <span
                        className={cn(
                          "font-medium text-sm",
                          isCollapsed ? "hidden" : "block"
                        )}
                      >
                        {section.label}
                      </span>
                    </div>
                  </button>
                );

                if (isCollapsed) {
                  return (
                    <div
                      className="w-full"
                      data-id={section.id}
                      key={section.id}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>{button}</TooltipTrigger>
                        <TooltipContent side="right">
                          <p>{section.label}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  );
                }

                return button;
              })}
            </AnimatedBackground>
          </div>
        </div>
      </TooltipProvider>
    </div>
  );
};
