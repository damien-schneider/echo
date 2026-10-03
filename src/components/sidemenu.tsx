import { ScrollArea } from "@ctrl-ui/react/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@ctrl-ui/react/ui/sidebar";
import {
  AudioLines,
  BookText,
  Box,
  ClipboardList,
  History,
  Keyboard,
  Settings2,
  Sparkles,
  Speech,
  Users,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { FileTranscriptionCenter } from "@/components/file-transcription-center";
import EchoLogo from "@/components/icons/echo-logo";
import { MeetingPage } from "@/components/meeting/meeting-page";
import { AboutDialog } from "@/components/settings/about/about-dialog";
import { AppSettings } from "@/components/settings/app/app-settings";
import { CapturesSettings } from "@/components/settings/captures/captures-settings";
import { CleanupSettings } from "@/components/settings/cleanup/cleanup-settings";
import { HistorySettings } from "@/components/settings/history/history-settings";
import { KeyboardTrackingSettings } from "@/components/settings/keyboard-tracking/keyboard-tracking-settings";
import { ModelsSettings } from "@/components/settings/models/models-settings";
import { PostProcessingSettings } from "@/components/settings/post-processing/post-processing-settings";
import { TranscriptionSettings } from "@/components/settings/transcription/transcription-settings";
import { TtsSettingsPage } from "@/components/settings/tts-settings-page";
import { ThemeSwitcher } from "@/components/theme-switcher";
export type SidebarSection = keyof typeof SECTIONS_CONFIG;
interface IconProps {
  className?: string;
}
interface SectionConfig {
  component: ComponentType;
  icon: ComponentType<IconProps>;
  label: string;
}
export const SECTIONS_CONFIG = {
  app: {
    component: AppSettings,
    icon: Settings2,
    label: "General",
  },
  captures: {
    component: CapturesSettings,
    icon: ClipboardList,
    label: "Captures",
  },
  cleanup: {
    component: CleanupSettings,
    icon: BookText,
    label: "On-device cleanup",
  },
  history: {
    component: HistorySettings,
    icon: History,
    label: "History",
  },
  "keyboard-tracking": {
    component: KeyboardTrackingSettings,
    icon: Keyboard,
    label: "Keyboard",
  },
  meeting: {
    component: MeetingPage,
    icon: Users,
    label: "Meeting",
  },
  models: {
    component: ModelsSettings,
    icon: Box,
    label: "Models",
  },
  "post-processing": {
    component: PostProcessingSettings,
    icon: Sparkles,
    label: "Post-processing",
  },
  "text-to-speech": {
    component: TtsSettingsPage,
    icon: Speech,
    label: "Text to speech",
  },
  transcription: {
    component: TranscriptionSettings,
    icon: AudioLines,
    label: "Transcription",
  },
} as const satisfies Record<string, SectionConfig>;
const isSidebarSection = (value: unknown): value is SidebarSection =>
  typeof value === "string" && Object.hasOwn(SECTIONS_CONFIG, value);
interface SettingsNavigationProps {
  activeSection: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
}

const sections = Object.keys(SECTIONS_CONFIG).filter(isSidebarSection);

function SettingsNavigation({
  activeSection,
  onSectionChange,
}: SettingsNavigationProps) {
  const { setOpenMobile } = useSidebar();
  function selectSection(section: SidebarSection) {
    onSectionChange(section);
    setOpenMobile(false);
  }
  return (
    <nav aria-label="Settings">
      <SidebarMenu>
        {sections.map((section) => {
          const { icon: Icon, label } = SECTIONS_CONFIG[section];
          return (
            <SidebarMenuItem key={section}>
              <SidebarMenuButton
                isActive={activeSection === section}
                onClick={() => selectSection(section)}
              >
                <Icon aria-hidden="true" className="size-4" />
                <span>{label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </nav>
  );
}

function AppSidebar(props: SettingsNavigationProps) {
  return (
    <Sidebar label="Settings">
      <SidebarHeader
        className="h-14 flex-row items-center gap-2.5 px-4"
        data-tauri-drag-region
      >
        <EchoLogo className="size-5" />
        <span className="font-semibold text-sm">Echo</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SettingsNavigation {...props} />
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="flex-row items-center border-sidebar-border border-t px-3 py-2">
        <ThemeSwitcher />
        <FileTranscriptionCenter />
        <AboutDialog />
      </SidebarFooter>
      <SidebarRail resizable />
    </Sidebar>
  );
}

export function SidebarLayout({
  activeSection,
  onSectionChange,
  children,
}: SettingsNavigationProps & { children: ReactNode }) {
  return (
    <SidebarProvider
      className="h-[calc(100dvh-2rem)]"
      defaultWidth={216}
      layout="contained"
      maxWidth={280}
      minWidth={184}
      persistOpen={false}
    >
      <AppSidebar
        activeSection={activeSection}
        onSectionChange={onSectionChange}
      />
      <SidebarInset className="min-h-0" render={<main />}>
        <header
          className="flex h-14 shrink-0 items-center gap-3 px-4"
          data-tauri-drag-region
        >
          <SidebarTrigger />
          <h1 className="font-semibold text-base">
            {SECTIONS_CONFIG[activeSection].label}
          </h1>
        </header>
        <ScrollArea
          className="min-h-0 flex-1"
          mask={false}
          viewportClassName="px-4 pb-8 sm:px-6"
        >
          <div className="mx-auto w-full max-w-2xl">{children}</div>
        </ScrollArea>
      </SidebarInset>
    </SidebarProvider>
  );
}
