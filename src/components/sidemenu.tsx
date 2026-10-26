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
  BookOpenTextIcon,
  ClockCounterClockwiseIcon,
  CubeIcon,
  KeyboardIcon,
  ListChecksIcon,
  SlidersHorizontalIcon,
  SparkleIcon,
  UsersIcon,
  WaveformIcon,
} from "@phosphor-icons/react";
import type { ComponentType, ReactNode } from "react";
import { AppVersion } from "@/components/app-version";
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
import { ThemeSwitcher } from "@/components/theme-switcher";
import {
  usesNativeTrafficLights,
  WindowControls,
} from "@/components/ui/window-controls";
import { cn } from "@/lib/utils";
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
    icon: SlidersHorizontalIcon,
    label: "General",
  },
  captures: {
    component: CapturesSettings,
    icon: ListChecksIcon,
    label: "Captures",
  },
  cleanup: {
    component: CleanupSettings,
    icon: BookOpenTextIcon,
    label: "On-device cleanup",
  },
  history: {
    component: HistorySettings,
    icon: ClockCounterClockwiseIcon,
    label: "History",
  },
  "keyboard-tracking": {
    component: KeyboardTrackingSettings,
    icon: KeyboardIcon,
    label: "Keyboard",
  },
  meeting: {
    component: MeetingPage,
    icon: UsersIcon,
    label: "Meeting",
  },
  models: {
    component: ModelsSettings,
    icon: CubeIcon,
    label: "Models",
  },
  "post-processing": {
    component: PostProcessingSettings,
    icon: SparkleIcon,
    label: "Post-processing",
  },
  transcription: {
    component: TranscriptionSettings,
    icon: WaveformIcon,
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
    <Sidebar label="Settings" variant="inset">
      <SidebarHeader
        className="h-12 flex-row items-center"
        data-tauri-drag-region
      >
        {!usesNativeTrafficLights && (
          <div className="flex items-center gap-2 px-2" data-tauri-drag-region>
            <EchoLogo className="size-4" />
            <span className="font-semibold text-body">Echo</span>
          </div>
        )}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SettingsNavigation {...props} />
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="flex-row items-center gap-0.5">
        <ThemeSwitcher />
        <FileTranscriptionCenter />
        <AboutDialog />
        <AppVersion className="ml-auto" />
      </SidebarFooter>
      <SidebarRail resizable />
    </Sidebar>
  );
}

function SettingsPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { state } = useSidebar();
  const sidebarIsCollapsed = state === "collapsed";
  return (
    <SidebarInset className="overflow-hidden" render={<main />}>
      <header
        className={cn(
          "flex h-10 shrink-0 items-center gap-1.5 px-2",
          sidebarIsCollapsed && usesNativeTrafficLights && "pl-[84px]"
        )}
        data-tauri-drag-region
      >
        <SidebarTrigger />
        <h1
          className="min-w-0 flex-1 truncate font-semibold text-body"
          data-tauri-drag-region
        >
          {title}
        </h1>
        <WindowControls />
      </header>
      <ScrollArea
        className="min-h-0 flex-1"
        mask={false}
        viewportClassName="px-4 pt-2 pb-10 sm:px-8"
      >
        <div className="mx-auto w-full max-w-2xl">{children}</div>
      </ScrollArea>
    </SidebarInset>
  );
}

export function SidebarLayout({
  activeSection,
  onSectionChange,
  children,
}: SettingsNavigationProps & { children: ReactNode }) {
  return (
    <SidebarProvider
      className="h-dvh"
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
      <SettingsPanel title={SECTIONS_CONFIG[activeSection].label}>
        {children}
      </SettingsPanel>
    </SidebarProvider>
  );
}
