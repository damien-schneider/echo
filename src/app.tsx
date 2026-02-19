import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Toaster } from "sonner";
import "./app.css";
import { AppHeader } from "@/components/app-header";
import { GlassWindow } from "@/components/ui/glass-window";
import { Spinner } from "@/components/ui/spinner";
import { AccessibilityPermissions } from "./components/accessibility-permissions";
import { ErrorDialog } from "./components/error-dialog";
import Onboarding from "./components/onboarding/onboarding";
import {
  SECTIONS_CONFIG,
  SidebarLayout,
  type SidebarSection,
} from "./components/sidemenu";
import { TranscriptionResultDialog } from "./components/transcription-result-dialog";
import { TitleBar } from "./components/ui/title-bar";
import { useFileTranscriptionListener } from "./hooks/use-file-transcription-listener";
import { useSetting, useSettingsStore } from "./stores/settings-store";

const renderSettingsContent = (section: SidebarSection) => {
  const ActiveComponent =
    SECTIONS_CONFIG[section]?.component ?? SECTIONS_CONFIG.app.component;
  return <ActiveComponent />;
};

function App() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [currentSection, setCurrentSection] = useState<SidebarSection>("app");
  const isLoading = useSettingsStore((s) => s.isLoading);
  const debugMode = useSetting("debug_mode");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const initialize = useSettingsStore((s) => s.initialize);
  const [isDragging, setIsDragging] = useState(false);
  const hasSignaledReady = useRef(false);

  useFileTranscriptionListener();

  // Initialize settings store — this is the root component
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Check onboarding status on mount
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      try {
        // Always check if they have any models available
        const modelsAvailable = await invoke<boolean>(
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
        const currentDebugMode = debugMode ?? false;
        updateSetting("debug_mode", !currentDebugMode);
      }
    };

    // Add event listener when component mounts
    document.addEventListener("keydown", handleKeyDown);

    // Cleanup event listener when component unmounts
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [debugMode, updateSetting]);

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

  // Handle drag events for file drop overlay
  useEffect(() => {
    const unlistenFns: (() => void)[] = [];

    const setupListeners = async () => {
      unlistenFns.push(await listen("drag-enter", () => setIsDragging(true)));
      unlistenFns.push(await listen("drag-over", () => setIsDragging(true)));
      unlistenFns.push(await listen("drag-leave", () => setIsDragging(false)));
      unlistenFns.push(
        await listen("file-transcription-progress", () => setIsDragging(false))
      );
      unlistenFns.push(
        await listen("file-transcription-error", () => setIsDragging(false))
      );
      unlistenFns.push(
        await listen("show-error-dialog", () => setIsDragging(false))
      );
    };

    setupListeners();

    return () => {
      for (const unlisten of unlistenFns) {
        unlisten();
      }
    };
  }, []);

  if (isInitializing) {
    return (
      <GlassWindow data-tauri-drag-region>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <Spinner className="size-8" />
          <p className="text-sm">Loading Echo...</p>
        </div>
      </GlassWindow>
    );
  }

  if (showOnboarding) {
    return (
      <GlassWindow>
        <Onboarding onModelSelected={handleModelSelected} />
      </GlassWindow>
    );
  }

  return (
    <GlassWindow>
      <TitleBar />
      <Toaster />
      <AppHeader />
      <SidebarLayout
        activeSection={currentSection}
        onSectionChange={setCurrentSection}
      >
        <div className="mx-auto max-w-xl">
          <AccessibilityPermissions />
          {renderSettingsContent(currentSection)}
        </div>
      </SidebarLayout>
      <TranscriptionResultDialog />
      <ErrorDialog />
      {isDragging && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-background/40 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <Upload className="h-12 w-12 text-muted-foreground" />
            <p className="font-medium text-muted-foreground text-sm">
              Drop audio or video to transcribe
            </p>
          </div>
        </div>
      )}
    </GlassWindow>
  );
}

export default App;
