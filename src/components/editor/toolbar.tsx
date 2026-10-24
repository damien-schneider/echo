import {
  Toolbar,
  ToolbarButton,
  ToolbarSeparator,
} from "@ctrl-ui/react/ui/toolbar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@ctrl-ui/react/ui/tooltip";
import {
  ArrowUUpLeftIcon,
  ArrowUUpRightIcon,
  CodeIcon,
  TextBIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
} from "@phosphor-icons/react";
import { useEditorRef, useEditorSelector } from "platejs/react";
import type { ReactNode } from "react";

const MARK_BUTTONS = [
  { icon: <TextBIcon />, label: "Bold", mark: "bold" },
  { icon: <TextItalicIcon />, label: "Italic", mark: "italic" },
  {
    icon: <TextStrikethroughIcon />,
    label: "Strikethrough",
    mark: "strikethrough",
  },
  { icon: <CodeIcon />, label: "Inline code", mark: "code" },
] as const;

export function EditorToolbar() {
  const editor = useEditorRef();
  const cannotUndo = useEditorSelector((e) => e.history.undos.length === 0, []);
  const cannotRedo = useEditorSelector((e) => e.history.redos.length === 0, []);
  return (
    <TooltipProvider>
      <Toolbar aria-label="Formatting" chrome="embedded">
        <EditorToolbarButton
          disabled={cannotUndo}
          label="Undo"
          onClick={() => editor.undo()}
        >
          <ArrowUUpLeftIcon />
        </EditorToolbarButton>
        <EditorToolbarButton
          disabled={cannotRedo}
          label="Redo"
          onClick={() => editor.redo()}
        >
          <ArrowUUpRightIcon />
        </EditorToolbarButton>
        <ToolbarSeparator />
        {MARK_BUTTONS.map(({ icon, label, mark }) => (
          <MarkToolbarButton key={mark} label={label} mark={mark}>
            {icon}
          </MarkToolbarButton>
        ))}
      </Toolbar>
    </TooltipProvider>
  );
}

function MarkToolbarButton({
  children,
  label,
  mark,
}: {
  children: ReactNode;
  label: string;
  mark: string;
}) {
  const editor = useEditorRef();
  const markIsActive = useEditorSelector((e) => e.api.hasMark(mark), [mark]);
  return (
    <EditorToolbarButton
      label={label}
      onClick={() => editor.tf.toggleMark(mark)}
      pressed={markIsActive}
    >
      {children}
    </EditorToolbarButton>
  );
}

function EditorToolbarButton({
  children,
  disabled,
  label,
  onClick,
  pressed,
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <ToolbarButton
            aria-label={label}
            aria-pressed={pressed}
            disabled={disabled}
            iconOnly
            onClick={onClick}
            onMouseDown={(event) => event.preventDefault()}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
