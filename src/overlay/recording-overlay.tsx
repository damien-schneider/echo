import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AlertTriangle, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { LiveWaveform } from "@/components/ui/live-waveform";
import "./recording-overlay.css";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { OVERLAY_HEIGHT, OVERLAY_WIDTH } from "@/lib/constants/overlay";
import { cn } from "@/lib/utils";
import { useTheme } from "@/providers";

type OverlayState = "recording" | "transcribing" | "warning";

interface WarningPayload {
  state: "warning";
  message: string;
}

const RecordingOverlay = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [state, setState] = useState<OverlayState>("recording");
  const [warningMessage, setWarningMessage] = useState("");
  const [audioLevels, setAudioLevels] = useState<number[]>([]);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const setupEventListeners = async () => {
      // Listen for show-overlay event from Rust
      const unlistenShow = await listen("show-overlay", (event) => {
        // Handle both simple string state and object with message
        if (typeof event.payload === "string") {
          setState(event.payload as OverlayState);
          setWarningMessage("");
        } else if (
          typeof event.payload === "object" &&
          event.payload !== null
        ) {
          const payload = event.payload as WarningPayload;
          if (payload.state === "warning") {
            setState("warning");
            setWarningMessage(payload.message || "Please wait...");
          }
        }
        setIsVisible(true);
      });

      // Listen for hide-overlay event from Rust
      const unlistenHide = await listen("hide-overlay", () => {
        setIsVisible(false);
      });

      // Listen for mic-level event from Rust
      const unlistenMic = await listen("mic-level", (event) => {
        setAudioLevels(event.payload as number[]);
      });

      // Cleanup function
      return () => {
        unlistenShow();
        unlistenHide();
        unlistenMic();
      };
    };

    setupEventListeners();
  }, []);

  // Register/unregister escape shortcut based on overlay visibility
  useEffect(() => {
    if (isVisible) {
      // Register escape shortcut when overlay becomes visible
      invoke("register_escape_shortcut").catch((error) => {
        console.error("Failed to register escape shortcut:", error);
      });
    } else {
      // Unregister escape shortcut when overlay becomes hidden
      invoke("unregister_escape_shortcut").catch((error) => {
        console.error("Failed to unregister escape shortcut:", error);
      });
    }

    // Cleanup: unregister escape shortcut when component unmounts
    return () => {
      invoke("unregister_escape_shortcut").catch((error) => {
        console.error(
          "Failed to unregister escape shortcut on cleanup:",
          error
        );
      });
    };
  }, [isVisible]);

  return (
    <motion.div
      animate={{
        opacity: isVisible ? 1 : 0,
        filter: isVisible ? "blur(0px)" : "blur(12px)",
        // scale: 1,
        // y: 0
      }}
      className={cn(
        "relative flex items-center justify-center rounded-xl border border-foreground/10 bg-background px-1",
        !isVisible && "pointer-events-none"
      )}
      initial={{
        opacity: 0,
        filter: "blur(12px)",
        // scale: 1,
        // y: 0
      }}
      style={{
        height: `${OVERLAY_HEIGHT}px`,
        width: `${OVERLAY_WIDTH}px`,
        // boxSizing: "border-box"
      }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30,
        mass: 0.8,
        opacity: {
          type: "spring",
          stiffness: 400,
          damping: 35,
        },
      }}
    >
      {/* Warning state content */}
      {state === "warning" && (
        <div className="flex items-center gap-2 px-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-orange-500" />
          <span className="text-foreground/80 text-xs leading-tight">
            {warningMessage}
          </span>
        </div>
      )}

      {/* Recording/Transcribing waveform */}
      {state !== "warning" && (
        <LiveWaveform
          active={state === "recording" && isVisible}
          audioLevels={audioLevels}
          barColor={resolvedTheme === "dark" ? "#ffffff" : "#000000"}
          barGap={1}
          // height={OVERLAY_HEIGHT}
          barRadius={99}
          barWidth={4}
          className="absolute top-1/2 left-1/2 flex-1 -translate-x-1/2 -translate-y-1/2"
          disableInternalAudio={true}
          fadeEdges={true}
          fadeWidth={20}
          mode="static"
          processing={state === "transcribing" && isVisible}
          smoothingTimeConstant={0.7}
          style={{
            height: `${OVERLAY_HEIGHT}px`,
            width: `${OVERLAY_WIDTH - 10}px`,
          }}
        />
      )}

      {state === "recording" && (
        <Button
          className="absolute top-px right-px rounded-full"
          onClick={() => {
            invoke("cancel_operation");
          }}
          size="icon-2xs"
          variant="ghost"
        >
          <XIcon className="size-3! text-muted-foreground" />
        </Button>
      )}
    </motion.div>
  );
};

export default RecordingOverlay;
