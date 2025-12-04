"use client";

import { Redo2Icon, Undo2Icon } from "lucide-react";
import { useEditorRef, useEditorSelector } from "platejs/react";
import type { ComponentProps } from "react";

import { ToolbarButton } from "./toolbar";

export function RedoToolbarButton(props: ComponentProps<typeof ToolbarButton>) {
  const editor = useEditorRef();
  const disabled = useEditorSelector((e) => e.history.redos.length === 0, []);

  return (
    <ToolbarButton
      {...props}
      disabled={disabled}
      onClick={() => editor.redo()}
      onMouseDown={(e) => e.preventDefault()}
      tooltip="Redo"
    >
      <Redo2Icon />
    </ToolbarButton>
  );
}

export function UndoToolbarButton(props: ComponentProps<typeof ToolbarButton>) {
  const editor = useEditorRef();
  const disabled = useEditorSelector((e) => e.history.undos.length === 0, []);

  return (
    <ToolbarButton
      {...props}
      disabled={disabled}
      onClick={() => editor.undo()}
      onMouseDown={(e) => e.preventDefault()}
      tooltip="Undo"
    >
      <Undo2Icon />
    </ToolbarButton>
  );
}
