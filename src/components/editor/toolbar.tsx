"use client";

import { Bold, Code, Italic, Strikethrough } from "lucide-react";
import { useEditorRef } from "platejs/react";
import { Button } from "@/components/ui/Button";
import {
  RedoToolbarButton,
  UndoToolbarButton,
} from "@/components/ui/history-toolbar-button";
import { Separator } from "@/components/ui/separator";
import { Toolbar } from "@/components/ui/toolbar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function EditorToolbar({ className }: { className?: string }) {
  const editor = useEditorRef();

  return (
    <TooltipProvider>
      <Toolbar
        className={cn(
          "flex items-center gap-1 rounded-t-lg border-input border-x border-t bg-muted/50 p-1",
          className
        )}
      >
        {/* History */}
        <UndoToolbarButton className="size-8" />
        <RedoToolbarButton className="size-8" />

        <Separator className="mx-1 h-6" orientation="vertical" />

        {/* Text formatting */}
        <ToolbarButton
          active={editor.api.hasMark("bold")}
          icon={<Bold className="size-4" />}
          onClick={() => editor.tf.toggleMark("bold")}
          tooltip="Bold (⌘B)"
        />
        <ToolbarButton
          active={editor.api.hasMark("italic")}
          icon={<Italic className="size-4" />}
          onClick={() => editor.tf.toggleMark("italic")}
          tooltip="Italic (⌘I)"
        />
        <ToolbarButton
          active={editor.api.hasMark("strikethrough")}
          icon={<Strikethrough className="size-4" />}
          onClick={() => editor.tf.toggleMark("strikethrough")}
          tooltip="Strikethrough"
        />
        <ToolbarButton
          active={editor.api.hasMark("code")}
          icon={<Code className="size-4" />}
          onClick={() => editor.tf.toggleMark("code")}
          tooltip="Inline Code (⌘E)"
        />
      </Toolbar>
    </TooltipProvider>
  );
}

type ToolbarButtonProps = {
  onClick: () => void;
  icon: React.ReactNode;
  tooltip: string;
  active?: boolean;
  disabled?: boolean;
};

function ToolbarButton({
  onClick,
  icon,
  tooltip,
  active,
  disabled,
}: ToolbarButtonProps) {
  return (
    <Button
      aria-label={tooltip}
      className={cn("size-8 p-0", active && "bg-accent text-accent-foreground")}
      disabled={disabled}
      onClick={onClick}
      size="sm"
      title={tooltip}
      variant="ghost"
    >
      {icon}
    </Button>
  );
}
