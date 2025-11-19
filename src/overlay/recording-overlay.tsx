import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { XIcon } from "lucide-react";
import { LiveWaveform } from "@/components/ui/live-waveform";
import "./recording-overlay.css";
import { cn } from "@/lib/utils";
import { useHotkeys } from 'react-hotkeys-hook'
import { Button } from "@/components/ui/Button";
import { OVERLAY_HEIGHT, OVERLAY_WIDTH } from "@/lib/constants/overlay";
import { motion } from "motion/react";
import { useTheme } from "@/providers";
type OverlayState = "recording" | "transcribing";

const RecordingOverlay = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [state, setState] = useState<OverlayState>("recording");
  const [audioLevels, setAudioLevels] = useState<number[]>([]);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const setupEventListeners = async () => {
      // Listen for show-overlay event from Rust
      const unlistenShow = await listen("show-overlay", (event) => {
        const overlayState = event.payload as OverlayState;
        setState(overlayState);
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
        console.error("Failed to unregister escape shortcut on cleanup:", error);
      });
    };
  }, [isVisible]);  

  return (
    <motion.div 
      className={cn("bg-background justify-center px-1 items-center flex border border-foreground/10 rounded-xl relative", !isVisible && "pointer-events-none")}
      style={{
        height: `${OVERLAY_HEIGHT}px`,
        width: `${OVERLAY_WIDTH}px`,
        // boxSizing: "border-box"
      }}
      initial={{ 
        opacity: 0, 
        filter: "blur(12px)",
        // scale: 1,
        // y: 0
      }}
      animate={{ 
        opacity: isVisible ? 1 : 0, 
        filter: isVisible ? "blur(0px)" : "blur(12px)",
        // scale: 1,
        // y: 0
      }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30,
        mass: 0.8,
        opacity: {
          type: "spring",
          stiffness: 400,
          damping: 35
        },
      }}
    >
      {/* THIS DIV IS NEEDED FOR CLEAN WIDTH CALCULATION */}
      {/* <div className=""> */}

      <LiveWaveform
        active={state === "recording" && isVisible}
        processing={state === "transcribing" && isVisible}
        audioLevels={audioLevels}
        disableInternalAudio={true}
        // height={OVERLAY_HEIGHT}
        className=" flex-1 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        barWidth={4}
        barGap={1}
        style={{ height: `${OVERLAY_HEIGHT}px`, width: `${OVERLAY_WIDTH-10}px` }}
        barColor={resolvedTheme === "dark" ? "#ffffff" : "#000000"}
        mode="static"
        fadeEdges={true}
        fadeWidth={20}
        smoothingTimeConstant={0.7}
        barRadius={99}
        />
        {/* </div> */}



      {state === "recording" && (
        <Button
        className="absolute rounded-full top-px right-px"
          variant="ghost"
          size="icon-2xs"
          onClick={() => {
            invoke("cancel_operation");
          }}
        >
          <XIcon className="size-3! text-muted-foreground" />
        </Button>
      )}
    </motion.div>
  );
};

export default RecordingOverlay;
