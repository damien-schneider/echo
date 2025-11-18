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
import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "@/providers";
type OverlayState = "recording" | "transcribing";

const RecordingOverlay = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [state, setState] = useState<OverlayState>("recording");
  const [deviceId, setDeviceId] = useState<string | undefined>();
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

      // Cleanup function
      return () => {
        unlistenShow();
        unlistenHide();
      };
    };

    setupEventListeners();

    // Get available audio devices and select the appropriate one
    const setupAudioDevice = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        // Use the default device (first available) or let LiveWaveform handle it
        if (audioInputs.length > 0) {
          setDeviceId(audioInputs[0].deviceId);
        }
      } catch (error) {
        console.error("Failed to enumerate audio devices:", error);
      }
    };

    setupAudioDevice();
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
    <AnimatePresence mode="wait">
      {isVisible && (
        <motion.div 
          className={cn("bg-background justify-center px-1 items-center flex border border-foreground/10 rounded-xl relative")}
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
            opacity: 1, 
            filter: "blur(0px)",
            // scale: 1,
            // y: 0
          }}
          exit={{ 
            opacity: 0, 
            filter: "blur(8px)",
            // scale: 0.8,
            // y: -4
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
            // filter: {
            //   type: "spring",
            //   stiffness: 200,
            //   damping: 25
            // },
            // scale: {
            //   type: "spring",
            //   stiffness: 400,
            //   damping: 30
            // },
            // y: {
            //   type: "spring",
            //   stiffness: 350,
            //   damping: 28
            // }
          }}
        >
          {/* THIS DIV IS NEEDED FOR CLEAN WIDTH CALCULATION */}
          {/* <div className=""> */}

          <LiveWaveform
            active={state === "recording"}
            processing={state === "transcribing"}
            deviceId={deviceId}
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
      )}
    </AnimatePresence>
  );
};

export default RecordingOverlay;
