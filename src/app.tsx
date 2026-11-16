import { UploadSimpleIcon } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { Toaster } from "sonner";
import "@/app.css";
import { AccessibilityPermissions } from "@/components/accessibility-permissions";
import { ErrorDialog } from "@/components/error-dialog";
import { MicrophonePermissions } from "@/components/microphone-permissions";
import Onboarding from "@/components/onboarding/onboarding";
import {
  SECTIONS_CONFIG,
  SidebarLayout,
  type SidebarSection,
} from "@/components/sidemenu";
import { TranscriptionResultDialog } from "@/components/transcription-result-dialog";
import { GlassWindow } from "@/components/ui/glass-window";
import { Spinner } from "@/components/ui/spinner";
import { useShortcutFailureToasts } from "@/features/shortcuts/use-shortcut-failure-toasts";
import { useFileTranscriptionListener } from "@/hooks/use-file-transcription-listener";
import { useMeetingListener } from "@/hooks/use-meeting-listener";
import {
  initialModelState,
  type ModelState,
  subscribeModelState,
} from "@/lib/model-state";
import { listenCancellable } from "@/lib/tauri-listener";
import { useSetting, useSettingsStore } from "@/stores/settings-store";

const isSidebarSection = (value: unknown): value is SidebarSection =>
  typeof value === "string" && Object.hasOwn(SECTIONS_CONFIG, value);

const READY_SIGNAL_RETRY_MS = 500;

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
  const [modelState, setModelState] = useState<ModelState>(initialModelState());

  useFileTranscriptionListener();
  useMeetingListener();
  useShortcutFailureToasts();

  useEffect(
    () => listenCancellable(() => subscribeModelState(setModelState)),
    []
  );

  useEffect(
    () =>
      listenCancellable(() =>
        listen<unknown>("open-settings-section", (event) => {
          if (isSidebarSection(event.payload)) {
            setCurrentSection(event.payload);
          }
        })
      ),
    []
  );

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    const checkOnboardingStatus = async () => {
      try {
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
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

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [debugMode, updateSetting]);

  const handleModelReady = () => {
    setShowOnboarding(false);
  };

  const isCheckingOnboarding = showOnboarding === null;
  const isInitializing = isLoading || isCheckingOnboarding;

  useEffect(() => {
    if (isInitializing || hasSignaledReady.current) {
      return;
    }
    let retry: ReturnType<typeof setTimeout>;
    const signalReady = () => {
      invoke("mark_frontend_ready")
        .then(() => {
          hasSignaledReady.current = true;
        })
        .catch((error) => {
          console.error("Failed to notify startup readiness", error);
          retry = setTimeout(signalReady, READY_SIGNAL_RETRY_MS);
        });
    };
    signalReady();
    return () => clearTimeout(retry);
  }, [isInitializing]);

  useEffect(() => {
    const toggleDropZoneOn = (event: string, visible: boolean) =>
      listenCancellable(() => listen(event, () => setIsDragging(visible)));
    const unlistenFns = [
      toggleDropZoneOn("drag-enter", true),
      toggleDropZoneOn("drag-over", true),
      toggleDropZoneOn("drag-leave", false),
      toggleDropZoneOn("file-transcription-progress", false),
      toggleDropZoneOn("file-transcription-error", false),
      toggleDropZoneOn("show-error-dialog", false),
    ];

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

  return (
    <GlassWindow data-model-state={showOnboarding ? undefined : modelState}>
      <Toaster />
      {showOnboarding ? (
        <Onboarding onModelReady={handleModelReady} />
      ) : (
        <>
          <SidebarLayout
            activeSection={currentSection}
            onSectionChange={setCurrentSection}
          >
            <div className="space-y-4">
              <AccessibilityPermissions />
              <MicrophonePermissions />
              {renderSettingsContent(currentSection)}
            </div>
          </SidebarLayout>
          <TranscriptionResultDialog />
          {isDragging && (
            <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-background/40 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                <UploadSimpleIcon className="h-12 w-12 text-muted-foreground" />
                <p className="font-medium text-muted-foreground text-sm">
                  Drop audio or video to transcribe
                </p>
              </div>
            </div>
          )}
        </>
      )}
      <ErrorDialog />
    </GlassWindow>
  );
}

export default App;
