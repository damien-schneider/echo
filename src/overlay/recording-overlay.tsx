import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AlertTriangle, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LiveWaveform } from "@/components/ui/live-waveform";
import "./recording-overlay.css";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import {
  TEXT_CONTAINER_HEIGHT,
  WAVEFORM_CONTAINER_HEIGHT,
  WAVEFORM_CONTAINER_WIDTH,
} from "@/lib/constants/overlay";
import { cn } from "@/lib/utils";
import { useTheme } from "@/providers";

type OverlayState = "recording" | "transcribing" | "warning";
type OverlayPositionPref = "top" | "bottom";

interface WarningPayload {
  state: "warning";
  message: string;
}

const RecordingOverlay = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [state, setState] = useState<OverlayState>("recording");
  const [warningMessage, setWarningMessage] = useState("");
  const [audioLevels, setAudioLevels] = useState<number[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [positionPref, setPositionPref] = useState<OverlayPositionPref>("top");
  const { resolvedTheme } = useTheme();
  const textScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const setupEventListeners = async () => {
      // Listen for overlay-position event from Rust
      const unlistenPosition = await listen("overlay-position", (event) => {
        const position = event.payload as OverlayPositionPref;
        setPositionPref(position);
      });

      // Listen for show-overlay event from Rust
      const unlistenShow = await listen("show-overlay", (event) => {
        // Handle both simple string state and object with message
        if (typeof event.payload === "string") {
          const newState = event.payload as OverlayState;
          setState(newState);
          setWarningMessage("");
          // Only reset streaming text when starting a NEW recording
          if (newState === "recording") {
            setStreamingText("");
          }
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

      // Listen for transcription progress
      const unlistenProgress = await listen(
        "transcription-progress",
        (event) => {
          const text = event.payload as string;
          setStreamingText(text);
        }
      );

      // Cleanup function
      return () => {
        unlistenPosition();
        unlistenShow();
        unlistenHide();
        unlistenMic();
        unlistenProgress();
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

  // Auto-scroll text to end when it updates
  useEffect(() => {
    if (textScrollRef.current && streamingText) {
      textScrollRef.current.scrollLeft = textScrollRef.current.scrollWidth;
    }
  }, [streamingText]);

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-0",
        !isVisible && "opacity-0"
      )}
    >
      {/* Waveform container - positioned at top, centered horizontally */}
      <motion.div
        animate={{
          opacity: isVisible ? 1 : 0,
          filter: isVisible ? "blur(0px)" : "blur(12px)",
        }}
        className={cn(
          "pointer-events-auto fixed left-1/2 flex -translate-x-1/2 items-center justify-center rounded-xl border border-foreground/10 bg-background px-1",
          positionPref === "top"
            ? "overlay-waveform-top"
            : "overlay-waveform-bottom"
        )}
        initial={{
          opacity: 0,
          filter: "blur(12px)",
        }}
        style={{
          height: `${WAVEFORM_CONTAINER_HEIGHT}px`,
          width: `${WAVEFORM_CONTAINER_WIDTH}px`,
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
            barRadius={99}
            barWidth={4}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            disableInternalAudio={true}
            fadeEdges={true}
            fadeWidth={20}
            mode="static"
            processing={state === "transcribing" && isVisible}
            smoothingTimeConstant={0.7}
            style={{
              height: `${WAVEFORM_CONTAINER_HEIGHT}px`,
              width: `${WAVEFORM_CONTAINER_WIDTH - 10}px`,
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

      {/* Streaming Text container - positioned at bottom, centered horizontally */}
      {streamingText && (
        <motion.div
          animate={{
            opacity: 1,
            y: 0,
          }}
          className="pointer-events-none fixed bottom-8 left-1/2 -translate-x-1/2 rounded-lg border border-foreground/10 bg-background/95 px-3 py-1.5 backdrop-blur-sm"
          initial={{
            opacity: 0,
            y: 10,
          }}
          style={{
            maxWidth: "80vw",
            height: `${TEXT_CONTAINER_HEIGHT}px`,
          }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30,
          }}
        >
          <div
            className="scrollbar-hide overflow-x-scroll"
            ref={textScrollRef}
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
            }}
          >
            <span className="inline-block whitespace-nowrap font-medium text-foreground/70 text-xs">
              {streamingText}
            </span>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default RecordingOverlay;
