import React from "react";
import { Cog, FlaskConical, History, Info, Sparkles, PanelLeft, Beaker } from "lucide-react";
import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import EchoLogo from "./icons/echo-logo";
import { useSettings } from "../hooks/useSettings";
import {
  GeneralSettings,
  AdvancedSettings,
  HistorySettings,
  DebugSettings,
  AboutSettings,
  PostProcessingSettings,
  ExperimentsSettings,
} from "./settings";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { AnimatedBackground } from "@/components/motion-primitives/animated-background";


const sidebarCollapsedAtom = atomWithStorage('sidebar_collapsed', true);

export type SidebarSection = keyof typeof SECTIONS_CONFIG;

interface IconProps {
  width?: number | string;
  height?: number | string;
  size?: number | string;
  className?: string;
  [key: string]: any;
}

interface SectionConfig {
  label: string;
  icon: React.ComponentType<IconProps>;
  component: React.ComponentType;
  enabled: (settings: any) => boolean;
}

// Wrapper component for EchoLogo to match IconProps interface
const EchoLogoIcon: React.FC<IconProps> = (props) => {
  const { size, strokeWidth, ...rest } = props;
  return <EchoLogo width={size || props.width || 20} height={size || props.height || 20} variant="sm" {...rest} />;
};

export const SECTIONS_CONFIG = {
  general: {
    label: "General",
    icon: EchoLogoIcon,
    component: GeneralSettings,
    enabled: () => true,
  },
  advanced: {
    label: "Advanced",
    icon: Cog,
    component: AdvancedSettings,
    enabled: () => true,
  },
  experiments: {
    label: "Experiments",
    icon: Sparkles,
    component: ExperimentsSettings,
    enabled: () => true,
  },
  postprocessing: {
    label: "Post Process",
    icon: Beaker,
    component: PostProcessingSettings,
    enabled: (settings) => settings?.beta_features_enabled ?? false,
  },
  history: {
    label: "History",
    icon: History,
    component: HistorySettings,
    enabled: () => true,
  },
  debug: {
    label: "Debug",
    icon: FlaskConical,
    component: DebugSettings,
    enabled: (settings) => settings?.debug_mode ?? false,
  },
  about: {
    label: "About",
    icon: Info,
    component: AboutSettings,
    enabled: () => true,
  },
} as const satisfies Record<string, SectionConfig>;

export const Sidemenu = ({
  activeSection,
  onSectionChange,
}: {
  activeSection: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
}
) => {
  const { settings } = useSettings();
  const [isCollapsed, setIsCollapsed] = useAtom(sidebarCollapsedAtom);

  const availableSections = Object.entries(SECTIONS_CONFIG)
    .filter(([_, config]) => config.enabled(settings))
    .map(([id, config]) => ({ id: id as SidebarSection, ...config }));

  return (
    <div className="px-2 pb-2">
        <TooltipProvider delayDuration={0}>

      <div className={cn("flex flex-col h-full items-center p-1 rounded-2xl bg-foreground/5 border border-foreground/5 transition-all duration-200",isCollapsed ? 'min-w-16 w-16' : 'min-w-40 w-40')} data-tauri-drag-region>
        <div className="relative w-full h-8">
          <Button
            onClick={() => setIsCollapsed(!isCollapsed)}
            variant="ghost"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn("rounded-lg absolute top-0 transition-all", isCollapsed ? '-translate-x-1/2 left-1/2' : 'left-full -translate-x-full')}
          >
            <PanelLeft 
              width={24} 
              height={24}
              className={cn("", isCollapsed ? 'rotate-180' : '')}
            />
          </Button>
        </div>
        <div className="flex flex-col w-full items-center gap-0 pt-2 px-1">
          <AnimatedBackground
            defaultValue={activeSection}
            enableHover={true}
            className="bg-foreground/10 rounded-lg peer w-full"
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
                  key={section.id}
                  data-id={section.id}
                  className={cn("w-full cursor-pointer", )}
                  onClick={() => onSectionChange(section.id)}
                >
                  <div className=" size-full flex h-10 px-3 w-full items-center gap-2">

                  <Icon strokeWidth={1} className="size-5" />

                  <span className={cn("text-sm font-medium",
                    isCollapsed ? "hidden": "block"
                  )}>{section.label}</span>
                  </div>

                </button>
              );

              if (isCollapsed) {
                return (
                  <div key={section.id} data-id={section.id} className="w-full">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        {button}
                      </TooltipTrigger>
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
