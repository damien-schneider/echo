import { Button } from "@ctrl-ui/react/ui/button";
import { ChatTextIcon, MagicWandIcon } from "@phosphor-icons/react";
import { type MotionValue, m, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { RecordGlyph } from "@/features/overlay-controls/glyph/record-glyph";
import type { IslandActionState } from "@/features/overlay-controls/recording-overlay-state";
import { cn } from "@/lib/utils";

interface IslandActionsProps {
  actionState: IslandActionState;
  isHovered: boolean;
  isVisible: boolean;
  onChat: () => void;
  onPolish: () => void;
  onRecord: () => void;
  orientation: "horizontal" | "vertical";
  voice: MotionValue<number>;
}
const actionClassName =
  "echo-island-action p-0 text-white/72 hover:text-white focus-visible:ring-1 focus-visible:ring-white/45 [&_svg]:size-4";
const ACTION_TOOLBAR_VARIANTS = {
  hidden: {
    transition: { staggerChildren: 0.02, staggerDirection: -1 },
  },
  visible: {
    transition: { staggerChildren: 0.02 },
  },
} as const;
const ACTION_ITEM_VARIANTS = {
  hidden: {
    filter: "blur(2px)",
    opacity: 0,
    transition: { duration: 0.12, ease: [0.4, 0, 1, 1] },
  },
  visible: {
    filter: "blur(0px)",
    opacity: 1,
    transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
  },
} as const;
interface IslandActionButtonProps {
  disabled: boolean;
  icon: ReactNode;
  isActive?: boolean;
  label: string;
  onAction: () => void;
  title: string;
}
const IslandActionButton = ({
  disabled,
  icon,
  isActive = false,
  label,
  onAction,
  title,
}: IslandActionButtonProps) => (
  <m.div className="echo-island-action-item" variants={ACTION_ITEM_VARIANTS}>
    <Button
      aria-label={label}
      aria-pressed={isActive || undefined}
      className={cn(actionClassName, isActive && "text-white")}
      disabled={disabled}
      iconOnly
      onClick={onAction}
      size="xs"
      title={title}
      variant="ghost"
    >
      {icon}
    </Button>
  </m.div>
);
export const IslandActions = ({
  actionState,
  isHovered,
  isVisible,
  onChat,
  onPolish,
  onRecord,
  orientation,
  voice,
}: IslandActionsProps) => {
  const reduceMotion = useReducedMotion();
  const isRecording = actionState === "recording";
  const recordLabel = isRecording ? "Stop recording" : "Start recording";
  return (
    <m.div
      animate={isVisible ? "visible" : "hidden"}
      aria-label="Echo actions"
      aria-orientation={orientation}
      className="echo-island-action-toolbar"
      data-orientation={orientation}
      exit="hidden"
      initial={reduceMotion ? false : "hidden"}
      role="toolbar"
      variants={ACTION_TOOLBAR_VARIANTS}
    >
      <IslandActionButton
        disabled={actionState === "busy"}
        icon={
          <RecordGlyph
            isHovered={isHovered}
            isRecording={isRecording}
            voice={voice}
          />
        }
        isActive={isRecording}
        label={recordLabel}
        onAction={onRecord}
        title={recordLabel}
      />
      <IslandActionButton
        disabled={actionState !== "idle"}
        icon={<ChatTextIcon aria-hidden="true" />}
        label="Open Echo chat"
        onAction={onChat}
        title="Open Echo chat (Option/Alt+2)"
      />
      <IslandActionButton
        disabled={actionState !== "idle"}
        icon={<MagicWandIcon aria-hidden="true" />}
        label="Polish selected text"
        onAction={onPolish}
        title="Polish selected text (Option/Alt+1)"
      />
    </m.div>
  );
};
