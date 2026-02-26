import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import "./recording-overlay.css";
import EchoLogo from "@/components/icons/echo-logo";
import { cn } from "@/lib/utils";

type OverlayState = "recording" | "transcribing" | "warning" | "tool";

interface WarningPayload {
  message: string;
  state: "warning" | "tool";
}

const NOTCH_HEIGHT = 42;
const NOTCH_WIDTH = 310;
const EXPANDED_HEIGHT = 76;
const TOP_OVERFLOW = 100;
const BAR_DELAYS = [0, 150, 300, 450];

/** Find peak amplitude within a slice of the levels array */
export const bandPeak = (
  levels: number[],
  start: number,
  end: number
): number => {
  let peak = 0;
  for (let j = start; j < end; j++) {
    const level = levels[j];
    if (level !== undefined && level > peak) {
      peak = level;
    }
  }
  return peak;
};

/** Update 4 bar elements directly from 64 frequency buckets (no React re-render) */
export const updateBars = (
  container: HTMLDivElement,
  levels: number[]
): void => {
  const bandSize = Math.floor(levels.length / 4);
  const { children } = container;

  for (let b = 0; b < 4; b++) {
    const start = b * bandSize;
    const end = b === 3 ? levels.length : start + bandSize;
    // Power curve (0.6) boosts visual reactivity for speech range
    const v = bandPeak(levels, start, end) ** 0.6;
    const el = children[b] as HTMLElement | undefined;
    if (el) {
      el.style.height = `${20 + v * 80}%`;
      el.style.opacity = String(0.4 + v * 0.6);
    }
  }
};

const RecordingOverlay = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [state, setState] = useState<OverlayState>("recording");
  const [warningMessage, setWarningMessage] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const textScrollRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const hasBeenShown = useRef(false);

  const hasText =
    Boolean(streamingText) || state === "warning" || state === "tool";

  // Store unlisten fns in a ref so the synchronous cleanup can call them
  const unlistenRef = useRef<UnlistenFn[]>([]);

  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      const unlistenShow = await listen<OverlayState | WarningPayload>(
        "show-overlay",
        (event) => {
          if (typeof event.payload === "string") {
            const newState = event.payload;
            setState(newState);
            setWarningMessage("");
            if (newState === "recording") {
              setStreamingText("");
            }
          } else if (
            typeof event.payload === "object" &&
            event.payload !== null &&
            (event.payload.state === "warning" ||
              event.payload.state === "tool")
          ) {
            setState(event.payload.state);
            setWarningMessage(event.payload.message || "Please wait...");
          }
          hasBeenShown.current = true;
          setIsVisible(true);
        }
      );

      const unlistenHide = await listen("hide-overlay", () => {
        setIsVisible(false);
      });

      // Direct DOM updates — bypasses React re-renders for ~30-60fps audio
      const unlistenMic = await listen<number[]>("mic-level", (event) => {
        const container = barsRef.current;
        if (container && event.payload.length > 0) {
          updateBars(container, event.payload);
        }
      });

      const unlistenProgress = await listen<string>(
        "transcription-progress",
        (event) => {
          setStreamingText(event.payload);
        }
      );

      // If cleanup already ran while we were awaiting, detach immediately
      const fns = [unlistenShow, unlistenHide, unlistenMic, unlistenProgress];
      if (cancelled) {
        for (const fn of fns) {
          fn();
        }
      } else {
        unlistenRef.current = fns;
      }
    };

    setup();

    // Synchronous cleanup — React always calls this, even with StrictMode
    return () => {
      cancelled = true;
      for (const fn of unlistenRef.current) {
        fn();
      }
      unlistenRef.current = [];
    };
  }, []);

  // Clear inline bar styles when leaving recording so CSS animation takes over
  useEffect(() => {
    if (state !== "recording") {
      const container = barsRef.current;
      if (!container) {
        return;
      }
      for (const child of Array.from(container.children)) {
        (child as HTMLElement).style.height = "";
        (child as HTMLElement).style.opacity = "";
      }
    }
  }, [state]);

  useEffect(() => {
    if (isVisible) {
      invoke("register_escape_shortcut").catch((error) => {
        console.error("Failed to register escape shortcut:", error);
      });
    } else {
      invoke("unregister_escape_shortcut").catch((error) => {
        console.error("Failed to unregister escape shortcut:", error);
      });
    }

    return () => {
      invoke("unregister_escape_shortcut").catch((error) => {
        console.error(
          "Failed to unregister escape shortcut on cleanup:",
          error
        );
      });
    };
  }, [isVisible]);

  // Fallback: listen for Escape via JavaScript keydown.
  // On Wayland (GNOME), the global shortcut plugin (X11-based) doesn't work,
  // but the overlay window receives focus, so keydown events reach the webview.
  useEffect(() => {
    if (!isVisible) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        invoke("cancel_operation");
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isVisible]);

  useEffect(() => {
    if (textScrollRef.current && streamingText) {
      textScrollRef.current.scrollTo({
        left: textScrollRef.current.scrollWidth,
        behavior: "smooth",
      });
    }
  }, [streamingText]);

  const isProcessing = state === "transcribing" && isVisible;

  return (
    <div className="pointer-events-none fixed inset-0 flex justify-center">
      {/* Extra top padding so the notch always feels anchored to the screen edge */}
      <div
        className={cn(
          "pointer-events-auto relative flex flex-col overflow-hidden rounded-b-3xl bg-black text-white transition-[max-height] duration-300",
          isVisible && "notch-show",
          !isVisible && hasBeenShown.current && "notch-hide",
          !(isVisible || hasBeenShown.current) &&
            "scale-x-60 scale-y-80 opacity-0 blur-lg",
          isProcessing && "notch-breathing"
        )}
        style={{
          width: `${NOTCH_WIDTH}px`,
          maxHeight:
            hasText && isVisible
              ? `${EXPANDED_HEIGHT + TOP_OVERFLOW}px`
              : `${NOTCH_HEIGHT + TOP_OVERFLOW}px`,
          paddingTop: `${TOP_OVERFLOW}px`,
          marginTop: `-${TOP_OVERFLOW}px`,
          transformOrigin: "top center",
          willChange: "scale, max-height",
        }}
      >
        {/* Top row: Logo left, Bars right */}
        <div className="flex shrink-0 items-center justify-between px-5 pt-2">
          <EchoLogo className="h-4 w-4 text-white/70" variant="sm" />
          <div
            className="flex h-5 w-5 items-center justify-center gap-0.5"
            ref={barsRef}
          >
            {BAR_DELAYS.map((delay) => (
              <div
                className={cn(
                  "h-[20%] w-[3px] rounded-full bg-white opacity-40",
                  isProcessing && "notch-bar-pulse"
                )}
                key={delay}
                style={
                  isProcessing ? { animationDelay: `${delay}ms` } : undefined
                }
              />
            ))}
          </div>
        </div>

        {/* Bottom row: Full-width transcription text */}
        <div
          className={cn(
            "scrollbar-hide overflow-x-auto whitespace-nowrap px-5 pt-3 pb-2 text-left font-medium text-[13px] text-white/80 transition-opacity duration-150",
            hasText && isVisible ? "opacity-100" : "opacity-0"
          )}
          ref={textScrollRef}
          style={{
            maskImage:
              "linear-gradient(to right, transparent, black 12px, black calc(100% - 12px), transparent)",
            WebkitMaskImage:
              "-webkit-linear-gradient(left, transparent, black 12px, black calc(100% - 12px), transparent)",
          }}
        >
          {state === "warning" || state === "tool"
            ? warningMessage
            : streamingText}
        </div>

        {/* Progress sweep line during transcription */}
        {isProcessing && <div className="notch-progress-line" />}
      </div>
    </div>
  );
};

export default RecordingOverlay;
