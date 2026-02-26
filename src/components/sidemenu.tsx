import {
  AudioLines,
  Box,
  History,
  Keyboard,
  PanelLeft,
  Settings2,
  Sparkles,
  Speech,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { FileTranscriptionCenter } from "@/components/file-transcription-center";
import EchoLogo from "@/components/icons/echo-logo";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getNormalizedOsPlatform } from "@/lib/os";
import { cn } from "@/lib/utils";
import { AboutDialog } from "./settings/about/about-dialog";
import { AppSettings } from "./settings/app/app-settings";
import { HistorySettings } from "./settings/history/history-settings";
import { KeyboardTrackingSettings } from "./settings/keyboard-tracking/keyboard-tracking-settings";
import { ModelsSettings } from "./settings/models/models-settings";
import { PostProcessingSettings } from "./settings/post-processing/post-processing-settings";
import { TranscriptionSettings } from "./settings/transcription/transcription-settings";
import { TtsSettingsPage } from "./settings/tts-settings-page";

const _isMacOS = getNormalizedOsPlatform() === "mac";

export type SidebarSection = keyof typeof SECTIONS_CONFIG;

interface IconProps {
  className?: string;
}

interface SectionConfig {
  component: React.ComponentType;
  icon: React.ComponentType<IconProps>;
  label: string;
}

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
  "post-processing": {
    label: "Post Processing",
    icon: Sparkles,
    component: PostProcessingSettings,
  },
  "text-to-speech": {
    label: "Text-to-Speech",
    icon: Speech,
    component: TtsSettingsPage,
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

const DEFAULT_SIDEBAR_WIDTH = "220px";
const MIN_SIDEBAR_WIDTH = "180px";
const MAX_SIDEBAR_WIDTH = "320px";

function AppSidebar({
  activeSection,
  onSectionChange,
}: {
  activeSection: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
}) {
  const availableSections = Object.entries(SECTIONS_CONFIG).map(
    ([id, config]) => ({ id: id as SidebarSection, ...config })
  );

  return (
    <div
      className="flex h-full w-full flex-col rounded-xl bg-foreground/5 p-2"
      data-tauri-drag-region
    >
      {/* Header: Logo */}
      <div
        className="flex shrink-0 select-none items-center gap-2 p-2"
        data-tauri-drag-region
      >
        <div className="flex aspect-square size-8 items-center justify-center rounded-lg">
          <EchoLogo className="size-4" data-tauri-drag-region />
        </div>
        <div className="grid flex-1 text-left text-sm leading-tight">
          <span className="truncate font-semibold">Echo</span>
          <span className="truncate text-muted-foreground text-xs">
            Settings
          </span>
        </div>
      </div>

      {/* Body: Scrollable menu items */}
      <ScrollArea
        className="-mx-2 min-h-16 flex-1"
        classNameViewport="min-w-0 overflow-x-hidden p-2"
        showMask={false}
      >
        <div className="flex flex-col gap-1" data-tauri-drag-region>
          {availableSections.map((section) => {
            const Icon = section.icon;
            return (
              <Button
                className={cn(
                  "w-full justify-start gap-2 font-normal",
                  activeSection === section.id &&
                    "bg-foreground/8 text-foreground"
                )}
                key={section.id}
                onClick={() => onSectionChange(section.id)}
                variant="ghost"
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{section.label}</span>
              </Button>
            );
          })}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div
        className="flex shrink-0 select-none flex-col gap-1"
        data-tauri-drag-region
      >
        <ThemeSwitcher />
        <FileTranscriptionCenter />
        <div className="flex items-center py-1.5">
          <AboutDialog />
        </div>
      </div>
    </div>
  );
}

export function SidebarLayout({
  activeSection,
  onSectionChange,
  children,
}: {
  activeSection: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const sidebarPanelRef = useRef<PanelImperativeHandle | null>(null);

  const toggleSidebar = useCallback(() => {
    const panel = sidebarPanelRef.current;
    if (!panel) {
      return;
    }
    if (panel.isCollapsed()) {
      panel.expand();
      setSidebarOpen(true);
    } else {
      panel.collapse();
      setSidebarOpen(false);
    }
  }, []);

  // Keyboard shortcut: Cmd+B / Ctrl+B
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "b" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn("flex h-[calc(100vh-2rem)] w-full gap-0 p-2 pt-0")}
        data-tauri-drag-region
      >
        <ResizablePanelGroup className="h-full flex-1" orientation="horizontal">
          <ResizablePanel
            collapsedSize={0}
            collapsible
            defaultSize={DEFAULT_SIDEBAR_WIDTH}
            maxSize={MAX_SIDEBAR_WIDTH}
            minSize={MIN_SIDEBAR_WIDTH}
            onResize={() => {
              const collapsed = sidebarPanelRef.current?.isCollapsed() ?? false;
              setSidebarOpen(!collapsed);
            }}
            panelRef={sidebarPanelRef}
          >
            <AppSidebar
              activeSection={activeSection}
              onSectionChange={onSectionChange}
            />
          </ResizablePanel>
          <ResizableHandle
            className={cn(
              "transition-[width,margin] duration-200",
              !sidebarOpen && "z-10 -mr-2 w-2"
            )}
            withHandle
          />
          <ResizablePanel className="flex h-full min-h-0">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {/* Toggle button when sidebar is collapsed */}
              {!sidebarOpen && (
                <div className="shrink-0 px-2 pt-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/20"
                        onClick={toggleSidebar}
                        type="button"
                      >
                        <PanelLeft className="size-4" />
                        <span className="sr-only">Toggle Sidebar</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Toggle Sidebar</TooltipContent>
                  </Tooltip>
                </div>
              )}
              <ScrollArea
                className="min-h-0 flex-1"
                classNameViewport="pt-4 *:w-full"
              >
                <div data-tauri-drag-region>{children}</div>
              </ScrollArea>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </TooltipProvider>
  );
}
