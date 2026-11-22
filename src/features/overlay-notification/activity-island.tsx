import { Button } from "@ctrl-ui/react/ui/button";
import { ArrowLineDownIcon, SquareIcon, XIcon } from "@phosphor-icons/react";
import { AnimatePresence, type MotionValue, m } from "motion/react";
import { type RefObject, useLayoutEffect } from "react";
import { IslandHud } from "@/features/overlay-controls/island-hud";
import {
  type ActivityAction,
  type ActivityDecoration,
  type ActivityVisualState,
  hasHorizontalOverflow,
} from "@/features/overlay-controls/recording-overlay-state";
import { FinishMark } from "@/features/overlay-notification/finish-mark/finish-mark";
import { cn } from "@/lib/utils";
export interface ActivityIslandAction extends ActivityAction {
  onAction: () => void;
}
interface ActivityIslandProps {
  action: ActivityIslandAction | null;
  decoration: ActivityDecoration;
  dismissLabel: string | null;
  hasFlanks: boolean;
  isHovered: boolean;
  onDismiss: () => void;
  text: string;
  textScrollRef: RefObject<HTMLOutputElement | null>;
  visualState: ActivityVisualState;
  voice: MotionValue<number>;
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
    className="echo-island-activity-dismiss text-white/50 hover:bg-white/10 hover:text-white focus-visible:ring-1 focus-visible:ring-white/45"
    iconOnly
    onClick={onDismiss}
    size="xs"
    title={label}
    variant="ghost"
  >
    <XIcon aria-hidden="true" />
  </Button>
);
interface ActivityActionButtonProps {
  action: ActivityIslandAction;
  hasText: boolean;
  isHovered: boolean;
  voice: MotionValue<number>;
}
const actionGlyph = ({
  action,
  hasText,
  isHovered,
  voice,
}: ActivityActionButtonProps) => {
  if (action.intent === "finish_recording") {
    return (
      <FinishMark
        hasText={hasText}
        isHovered={isHovered}
        isLoading={action.isPending}
        voice={voice}
      />
    );
  }
  if (action.intent === "stop_meeting") {
    return <SquareIcon aria-hidden="true" className="size-3" />;
  }
  return <ArrowLineDownIcon aria-hidden="true" className="size-3.5" />;
};
const ActivityActionButton = (props: ActivityActionButtonProps) => {
  const { action } = props;
  const isFinish = action.intent === "finish_recording";
  return (
    <Button
      aria-label={action.title}
      className={cn(
        "echo-island-activity-submit focus-visible:ring-1 focus-visible:ring-white/60",
        isFinish
          ? "text-white hover:bg-white/10 disabled:opacity-100"
          : "bg-white/90 text-black shadow-none hover:bg-white"
      )}
      disabled={action.isPending}
      iconOnly
      onClick={action.onAction}
      size="xs"
      title={action.title}
      variant={isFinish ? "ghost" : "surface"}
    >
      {actionGlyph(props)}
    </Button>
  );
};
const ACTION_HIDDEN = {
  filter: "blur(2px)",
  opacity: 0,
  transform: "scale(0.8)",
} as const;
const ACTION_SHOWN = {
  filter: "none",
  opacity: 1,
  transform: "scale(1)",
} as const;
const ACTION_SWAP = { duration: 0.18, ease: [0.22, 1, 0.36, 1] } as const;
interface ActivityActionSlotProps
  extends Omit<ActivityActionButtonProps, "action"> {
  action: ActivityIslandAction | null;
}
const ActivityActionSlot = ({ action, ...glyph }: ActivityActionSlotProps) => (
  <AnimatePresence initial={false}>
    {action ? (
      <m.span
        animate={ACTION_SHOWN}
        className="echo-island-activity-action"
        exit={ACTION_HIDDEN}
        initial={ACTION_HIDDEN}
        key="action"
        transition={ACTION_SWAP}
      >
        <ActivityActionButton action={action} {...glyph} />
      </m.span>
    ) : null}
  </AnimatePresence>
);
export const ActivityIsland = ({
  action,
  decoration,
  dismissLabel,
  hasFlanks,
  isHovered,
  onDismiss,
  text,
  textScrollRef,
  visualState,
  voice,
}: ActivityIslandProps) => {
  const isError = visualState === "error";
  const isProcessing = visualState === "processing";
  useActivityTextOverflow({ text, textScrollRef });
  const dismiss = dismissLabel ? (
    <ActivityDismissButton label={dismissLabel} onDismiss={onDismiss} />
  ) : null;
  const submit = (
    <ActivityActionSlot
      action={action}
      hasText={Boolean(text)}
      isHovered={isHovered}
      voice={voice}
    />
  );
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
