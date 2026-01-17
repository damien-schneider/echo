import { getVersion } from "@tauri-apps/api/app";
import {
  AudioLines,
  Box,
  History,
  Keyboard,
  Settings2,
  Sparkles,
  Speech,
} from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { FileTranscriptionCenter } from "@/components/file-transcription-center";
import EchoLogo from "@/components/icons/echo-logo";
import { Badge } from "@/components/ui/Badge";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { AboutDialog } from "./settings/about/about-dialog";
import { AppSettings } from "./settings/app/app-settings";
import { HistorySettings } from "./settings/history/history-settings";
import { KeyboardTrackingSettings } from "./settings/keyboard-tracking/keyboard-tracking-settings";
import { ModelsSettings } from "./settings/models/models-settings";
import { PostProcessingSettings } from "./settings/post-processing/post-processing-settings";
import { TranscriptionSettings } from "./settings/transcription/transcription-settings";
import { TtsSettingsPage } from "./settings/tts-settings-page";
import UpdateChecker from "./update-checker";

export type SidebarSection = keyof typeof SECTIONS_CONFIG;

interface IconProps {
  className?: string;
}

interface SectionConfig {
  label: string;
  icon: React.ComponentType<IconProps>;
  component: React.ComponentType;
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

function SidebarVersionFooter() {
  const [version, setVersion] = useState("");

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const appVersion = await getVersion();
        setVersion(appVersion);
      } catch (error) {
        console.error("Failed to get app version:", error);
        setVersion("0.1.2");
      }
    };

    fetchVersion();
  }, []);

  return (
    <SidebarFooter className="select-none" data-tauri-drag-region>
      <SidebarMenu>
        <SidebarMenuItem>
          <FileTranscriptionCenter />
        </SidebarMenuItem>
        <SidebarMenuItem>
          <div className="flex items-center justify-between py-1.5">
            <div className="flex items-center gap-2">
              <AboutDialog />
              <div className="flex items-center gap-1 group-data-[collapsible=icon]:hidden">
                <UpdateChecker />
                <Badge size="sm" variant="outline">
                  v{version}
                </Badge>
              </div>
            </div>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}

function AppSidebar({
  activeSection,
  onSectionChange,
  ...props
}: {
  activeSection: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
} & React.ComponentProps<typeof Sidebar>) {
  const availableSections = Object.entries(SECTIONS_CONFIG).map(
    ([id, config]) => ({ id: id as SidebarSection, ...config })
  );

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader className="select-none" data-tauri-drag-region>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="select-none hover:bg-transparent active:bg-transparent"
              data-tauri-drag-region-with-children
              size="lg"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg text-sidebar-primary-foreground">
                <EchoLogo className="size-4" data-tauri-drag-region />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Echo</span>
                <span className="truncate text-muted-foreground text-xs">
                  Settings
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent data-tauri-drag-region>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {availableSections.map((section) => {
                const Icon = section.icon;
                return (
                  <SidebarMenuItem key={section.id}>
                    <SidebarMenuButton
                      isActive={activeSection === section.id}
                      onClick={() => onSectionChange(section.id)}
                      tooltip={section.label}
                    >
                      <Icon />
                      <span>{section.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarVersionFooter />
      <SidebarRail />
    </Sidebar>
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
  return (
    <SidebarProvider defaultOpen={false}>
      <AppSidebar
        activeSection={activeSection}
        onSectionChange={onSectionChange}
      />
      <SidebarInset
        className={cn(
          "flex flex-col overflow-hidden",
          // Override the default ml-0 for inset variant when sidebar is expanded
          "md:peer-data-[state=expanded]:peer-data-[variant=inset]:ml-[var(--sidebar-width)]",
          // When collapsed, no margin
          "md:peer-data-[state=collapsed]:peer-data-[variant=inset]:ml-0",
          // Smooth transition
          "transition-[margin] duration-200 ease-linear"
        )}
        data-tauri-drag-region
      >
        <div
          className="flex h-full w-full overflow-auto pt-4 *:w-full"
          data-tauri-drag-region
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

// Keep backwards compatibility
export const Sidemenu = ({
  activeSection,
  onSectionChange,
}: {
  activeSection: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
}) => (
  <SidebarProvider defaultOpen={false}>
    <AppSidebar
      activeSection={activeSection}
      onSectionChange={onSectionChange}
    />
  </SidebarProvider>
);
