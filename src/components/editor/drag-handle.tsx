"use client";

import { DragHandle as TiptapDragHandle } from "@tiptap/extension-drag-handle-react";
import type { Editor } from "@tiptap/react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

type DragHandleProps = {
  editor: Editor;
  className?: string;
};

export function DragHandle({ editor, className }: DragHandleProps) {
  return (
    <TiptapDragHandle editor={editor}>
      <div
        className={cn(
          "flex cursor-grab items-center justify-center rounded p-1 opacity-50 transition-opacity hover:bg-accent hover:opacity-100 active:cursor-grabbing",
          className
        )}
      >
        <GripVertical className="size-4 text-muted-foreground" />
      </div>
    </TiptapDragHandle>
  );
}
