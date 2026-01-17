import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Toaster } from "sonner";
import "./App.css";
import { GlassWindow } from "@/components/ui/glass-window";
import { Spinner } from "@/components/ui/spinner";
import { AccessibilityPermissions } from "./components/accessibility-permissions";
import { ErrorDialog } from "./components/error-dialog";
import Onboarding from "./components/onboarding";
import {
  SECTIONS_CONFIG,
  SidebarLayout,
  type SidebarSection,
} from "./components/sidemenu";
import { TranscriptionResultDialog } from "./components/transcription-result-dialog";
import { TitleBar } from "./components/ui/title-bar";
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
  const [isDragging, setIsDragging] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionProgress, setTranscriptionProgress] = useState(0);
  const hasSignaledReady = useRef(false);

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
    };

    setupListeners();

    return () => {
      for (const unlisten of unlistenFns) {
        unlisten();
      }
    };
  }, []);

  // Handle transcription progress
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen(
        "file-transcription-progress",
        (event: { payload: { status: string; progress: number } }) => {
          const { status, progress } = event.payload;
          if (status === "complete") {
            setIsTranscribing(false);
            setTranscriptionProgress(0);
          } else {
            setIsTranscribing(true);
            setTranscriptionProgress(progress);
          }
        }
      );
    };

    setupListener();

    return () => {
      unlisten?.();
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
      <SidebarLayout
        activeSection={currentSection}
        onSectionChange={setCurrentSection}
      >
        <div className="mx-auto max-w-xl">
          <AccessibilityPermissions />
          <div>{renderSettingsContent(currentSection)}</div>
        </div>
      </SidebarLayout>
      <TranscriptionResultDialog />
      <ErrorDialog />
      {isDragging && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-background/40 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <Upload className="h-12 w-12 text-muted-foreground" />
            <p className="font-medium text-muted-foreground text-sm">
              Drop to transcribe
            </p>
          </div>
        </div>
      )}
    </GlassWindow>
  );
}

export default App;
