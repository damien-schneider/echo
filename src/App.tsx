import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { Toaster } from "sonner";
import "./App.css";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { getNormalizedOsPlatform } from "@/lib/os";
import { cn } from "@/lib/utils";
import { AccessibilityPermissions } from "./components/accessibility-permissions";
import Footer from "./components/footer";
import Onboarding from "./components/onboarding";
import {
  SECTIONS_CONFIG,
  type SidebarSection,
  Sidemenu,
} from "./components/sidemenu";
import { useSettings } from "./hooks/use-settings";

const renderSettingsContent = (section: SidebarSection) => {
  const ActiveComponent =
    SECTIONS_CONFIG[section]?.component ?? SECTIONS_CONFIG.app.component;
  return <ActiveComponent />;
};

function App() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [currentSection, setCurrentSection] = useState<SidebarSection>("app");
  const { settings, updateSetting, isLoading } = useSettings();
  const hasSignaledReady = useRef(false);
  const osPlatform = getNormalizedOsPlatform();

  // Check onboarding status on mount
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      try {
        // Always check if they have any models available
        const modelsAvailable: boolean = await invoke(
          "has_any_models_available"
        );
        setShowOnboarding(!modelsAvailable);
      } catch (error) {
        console.error("Failed to check onboarding status:", error);
        setShowOnboarding(true);
      }
    };
    checkOnboardingStatus();
  }, []);

  // Handle keyboard shortcuts for debug mode toggle
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Ctrl+Shift+D (Windows/Linux) or Cmd+Shift+D (macOS)
      const isDebugShortcut =
        event.shiftKey &&
        event.key.toLowerCase() === "d" &&
        (event.ctrlKey || event.metaKey);

      if (isDebugShortcut) {
        event.preventDefault();
        const currentDebugMode = settings?.debug_mode ?? false;
        updateSetting("debug_mode", !currentDebugMode);
      }
    };

    // Add event listener when component mounts
    document.addEventListener("keydown", handleKeyDown);

    // Cleanup event listener when component unmounts
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [settings?.debug_mode, updateSetting]);

  const handleModelSelected = () => {
    // Transition to main app - user has started a download
    setShowOnboarding(false);
  };

  const isCheckingOnboarding = showOnboarding === null;
  const isInitializing = isLoading || isCheckingOnboarding;

  useEffect(() => {
    if (!(isInitializing || hasSignaledReady.current)) {
      invoke("mark_frontend_ready")
        .then(() => {
          hasSignaledReady.current = true;
        })
        .catch((error) => {
          console.error("Failed to notify startup readiness", error);
        });
    }
  }, [isInitializing]);

  if (isInitializing) {
    return (
      <div
        className="flex h-screen w-full flex-col items-center justify-center gap-3 text-muted-foreground"
        data-tauri-drag-region
      >
        <Spinner className="size-8" />
        <p className="text-sm">Loading Echo...</p>
      </div>
    );
  }

  if (showOnboarding) {
    return <Onboarding onModelSelected={handleModelSelected} />;
  }

  return (
    <div
      className={cn(
        "flex h-screen flex-col",
        osPlatform === "linux" && "bg-background",
        osPlatform === "mac" &&
          "rounded-[26px] bg-background/85 backdrop-blur-xs"
      )}
      data-tauri-drag-region
    >
      <Toaster />
      {/* Draggable header region */}
      <div className="h-8 w-full shrink-0 select-none" data-tauri-drag-region />
      {/* Main content area that takes remaining space */}
      <div className="flex flex-1 overflow-hidden" data-tauri-drag-region>
        <Sidemenu
          activeSection={currentSection}
          onSectionChange={setCurrentSection}
        />
        {/* Scrollable content area */}

        <ScrollArea className="w-full *:mx-auto *:max-w-xl">
          <AccessibilityPermissions />
          {renderSettingsContent(currentSection)}
        </ScrollArea>
      </div>
      {/* Fixed footer at bottom */}
      <Footer />
    </div>
  );
}

export default App;
