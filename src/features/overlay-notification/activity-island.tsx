import { X } from "lucide-react";
import { type ReactNode, type RefObject, useLayoutEffect } from "react";
import { Button } from "@/components/ui/button";
import { PolishProcessingOrbit } from "@/features/overlay-controls/motion/island-morph";
import {
  type ActivityDecoration,
  type ActivityVisualState,
  hasHorizontalOverflow,
} from "@/features/overlay-controls/recording-overlay-state";
import { cn } from "@/lib/utils";

export interface ActivityIslandAction {
  icon: ReactNode;
  label: string;
  onAction: () => void;
  title: string;
}

interface ActivityIslandProps {
  action: ActivityIslandAction | null;
  decoration: ActivityDecoration;
  dismissLabel: string | null;
  microphoneRef: RefObject<HTMLSpanElement | null>;
  onDismiss: () => void;
  text: string;
  textScrollRef: RefObject<HTMLOutputElement | null>;
  visualState: ActivityVisualState;
}

interface ActivityTextOverflowOptions {
  text: string;
  textScrollRef: RefObject<HTMLOutputElement | null>;
}

const useActivityTextOverflow = ({
  text,
  textScrollRef,
}: ActivityTextOverflowOptions) => {
  useLayoutEffect(() => {
    const output = textScrollRef.current;
    if (!output) {
      return;
    }
    const measureOverflow = () => {
      output.classList.toggle(
        "notch-transcript-text-overflowing",
        Boolean(text) && hasHorizontalOverflow(output)
      );
    };
    measureOverflow();
    const observer = new ResizeObserver(measureOverflow);
    observer.observe(output);
    return () => {
      observer.disconnect();
      output.classList.remove("notch-transcript-text-overflowing");
    };
  }, [text, textScrollRef]);
};

const MicrophoneAmbience = ({
  microphoneRef,
}: Pick<ActivityIslandProps, "microphoneRef">) => (
  <span
    aria-hidden="true"
    className="echo-island-microphone-ambience"
    ref={microphoneRef}
  />
);

interface ActivityDismissButtonProps {
  label: string;
  onDismiss: () => void;
}

const ActivityDismissButton = ({
  label,
  onDismiss,
}: ActivityDismissButtonProps) => (
  <Button
    aria-label={label}
    className="echo-island-activity-dismiss size-7 rounded-full text-white/50 hover:bg-white/10 hover:text-white focus-visible:ring-1 focus-visible:ring-white/45"
    onClick={onDismiss}
    size="icon-xs"
    title={label}
    variant="ghost"
  >
    <X aria-hidden="true" />
  </Button>
);

const ActivityActionButton = ({
  icon,
  label,
  onAction,
  title,
}: ActivityIslandAction) => (
  <Button
    aria-label={title}
    className="echo-island-activity-submit h-7 rounded-md bg-white/90 px-2.5 font-medium text-[11px] text-black shadow-none hover:bg-white focus-visible:ring-1 focus-visible:ring-white/60"
    onClick={onAction}
    size="sm"
    title={title}
    variant="secondary"
  >
    {icon}
    {label}
  </Button>
);

export const ActivityIsland = ({
  action,
  decoration,
  dismissLabel,
  microphoneRef,
  onDismiss,
  text,
  textScrollRef,
  visualState,
}: ActivityIslandProps) => {
  const isError = visualState === "error";
  const isProcessing = visualState === "processing";
  useActivityTextOverflow({ text, textScrollRef });
  return (
    <section
      aria-busy={isProcessing}
      aria-label="Echo activity"
      className="echo-island-activity"
      data-decoration={decoration}
      data-has-text={Boolean(text)}
      data-state={visualState}
    >
      {decoration === "orbit" ? <PolishProcessingOrbit /> : null}
      {decoration === "microphone" ? (
        <MicrophoneAmbience microphoneRef={microphoneRef} />
      ) : null}
      {dismissLabel ? (
        <ActivityDismissButton label={dismissLabel} onDismiss={onDismiss} />
      ) : null}
      {action ? <ActivityActionButton {...action} /> : null}
      {text ? (
        <output
          aria-live={isError ? "assertive" : "polite"}
          className={cn(
            "scrollbar-hide relative z-1 overflow-x-auto whitespace-nowrap text-[12px] text-white/68",
            !action && dismissLabel && "pr-7"
          )}
          ref={textScrollRef}
          role={isError ? "alert" : undefined}
        >
          {text}
        </output>
      ) : null}
      {isProcessing && decoration !== "orbit" ? (
        <span className="notch-progress-line" />
      ) : null}
    </section>
  );
};
