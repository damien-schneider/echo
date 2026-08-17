import { X } from "lucide-react";
import { type ReactNode, type RefObject, useLayoutEffect } from "react";
import { Button } from "@/components/ui/button";
import { IslandHud } from "@/features/overlay-controls/island-hud";
import {
  type ActivityDecoration,
  type ActivityVisualState,
  hasHorizontalOverflow,
} from "@/features/overlay-controls/recording-overlay-state";

export interface ActivityIslandAction {
  icon: ReactNode;
  onAction: () => void;
  title: string;
}

interface ActivityIslandProps {
  action: ActivityIslandAction | null;
  decoration: ActivityDecoration;
  dismissLabel: string | null;
  /// A cut-out to sit either side of — the controls leave the text row and take the flanks.
  hasFlanks: boolean;
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
    className="echo-island-activity-dismiss size-6 rounded-full text-white/50 hover:bg-white/10 hover:text-white focus-visible:ring-1 focus-visible:ring-white/45"
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
  onAction,
  title,
}: ActivityIslandAction) => (
  <Button
    aria-label={title}
    className="echo-island-activity-submit size-6 rounded-full bg-white/90 text-black shadow-none hover:bg-white focus-visible:ring-1 focus-visible:ring-white/60"
    onClick={onAction}
    size="icon-xs"
    title={title}
    variant="secondary"
  >
    {icon}
  </Button>
);

export const ActivityIsland = ({
  action,
  decoration,
  dismissLabel,
  hasFlanks,
  onDismiss,
  text,
  textScrollRef,
  visualState,
}: ActivityIslandProps) => {
  const isError = visualState === "error";
  const isProcessing = visualState === "processing";
  useActivityTextOverflow({ text, textScrollRef });
  const dismiss = dismissLabel ? (
    <ActivityDismissButton label={dismissLabel} onDismiss={onDismiss} />
  ) : null;
  const submit = action ? <ActivityActionButton {...action} /> : null;
  return (
    <IslandHud
      hasFlanks={hasFlanks}
      layout="activity"
      leftFlank={hasFlanks ? dismiss : null}
      rightFlank={hasFlanks ? submit : null}
    >
      <section
        aria-busy={isProcessing}
        aria-label="Echo activity"
        className="echo-island-activity"
        data-decoration={decoration}
        data-flanked={hasFlanks}
        data-has-text={Boolean(text)}
        data-state={visualState}
      >
        {text ? (
          <output
            aria-live={isError ? "assertive" : "polite"}
            className="scrollbar-hide relative z-1 overflow-x-auto whitespace-nowrap text-[12px] text-white/68"
            ref={textScrollRef}
            role={isError ? "alert" : undefined}
          >
            {text}
          </output>
        ) : null}
        {hasFlanks ? null : submit}
        {hasFlanks ? null : dismiss}
      </section>
    </IslandHud>
  );
};
