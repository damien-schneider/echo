import { MessageSquareText, Mic, WandSparkles } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { IslandActionState } from "@/features/overlay-controls/recording-overlay-state";
import { cn } from "@/lib/utils";

interface IslandActionsProps {
  actionState: IslandActionState;
  isVisible: boolean;
  onChat: () => void;
  onPolish: () => void;
  onRecord: () => void;
  orientation: "horizontal" | "vertical";
}

const actionClassName =
  "echo-island-action p-0 text-white/68 hover:bg-white/10 hover:text-white focus-visible:ring-1 focus-visible:ring-white/45 [&_svg]:size-3";

const ACTION_TOOLBAR_VARIANTS = {
  hidden: {
    transition: { staggerChildren: 0.02, staggerDirection: -1 },
  },
  visible: {
    transition: { staggerChildren: 0.02 },
  },
} as const;

// nothing here may resize: the action row holds one layout while the shell grows around it
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
      className={cn(
        actionClassName,
        isActive && "bg-white text-black hover:bg-white/88 hover:text-black"
      )}
      disabled={disabled}
      onClick={onAction}
      size="icon-2xs"
      title={title}
      variant="ghost"
    >
      {icon}
    </Button>
  </m.div>
);

export const IslandActions = ({
  actionState,
  isVisible,
  onChat,
  onPolish,
  onRecord,
  orientation,
}: IslandActionsProps) => {
  const reduceMotion = useReducedMotion();
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
        icon={<Mic aria-hidden="true" />}
        isActive={actionState === "recording"}
        label={
          actionState === "recording" ? "Stop recording" : "Start recording"
        }
        onAction={onRecord}
        title={
          actionState === "recording" ? "Stop recording" : "Start recording"
        }
      />
      <IslandActionButton
        disabled={actionState !== "idle"}
        icon={<MessageSquareText aria-hidden="true" />}
        label="Open Echo chat"
        onAction={onChat}
        title="Open Echo chat"
      />
      <IslandActionButton
        disabled={actionState !== "idle"}
        icon={<WandSparkles aria-hidden="true" />}
        label="Polish selected text"
        onAction={onPolish}
        title="Polish selected text (Option/Alt+1)"
      />
    </m.div>
  );
};
