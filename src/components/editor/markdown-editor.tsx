"use client";

import { EditorContent } from "@tiptap/react";
import { common, createLowlight } from "lowlight";
import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { DragHandle } from "./drag-handle";
import { SlashMenu } from "./slash-menu";
import { EditorToolbar } from "./toolbar";
import { useMarkdownEditor } from "./use-markdown-editor";
import "./editor.css";

const lowlight = createLowlight(common);

type MarkdownEditorProps = {
  value?: string;
  onChange?: (markdown: string) => void;
  placeholder?: string;
  className?: string;
  editorClassName?: string;
  autoFocus?: boolean;
  editable?: boolean;
  showToolbar?: boolean;
  showSlashMenu?: boolean;
  showDragHandle?: boolean;
  showMentionMenu?: boolean;
};

export function MarkdownEditor({
  value = "",
  onChange,
  placeholder = "Start typing or press '/' for commands...",
  className,
  editorClassName,
  autoFocus = false,
  editable = true,
  showToolbar = true,
  showSlashMenu = true,
  showDragHandle = true,
  showMentionMenu = false,
}: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleUpdate = useCallback(
    (markdown: string) => {
      onChange?.(markdown);
    },
    [onChange]
  );

  const { editor } = useMarkdownEditor({
    content: value,
    onUpdate: handleUpdate,
    placeholder,
    autoFocus,
    editable,
    lowlight,
    enableMentions: showMentionMenu,
  });

  if (!editor) {
    return (
      <div
        className={cn("h-64 animate-pulse rounded-lg bg-muted", className)}
      />
    );
  }

  return (
    <div className={cn("relative flex flex-col", className)} ref={containerRef}>
      <div className="relative">
        {showDragHandle && editable && <DragHandle editor={editor} />}

        <EditorContent
          className={cn(
            "prose prose-sm dark:prose-invert max-w-none",
            "min-h-[200px] w-full rounded-lg border border-input bg-background px-4 py-3",
            "[&_.ProseMirror]:min-h-[180px] [&_.ProseMirror]:outline-none",
            "[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none",
            "[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left",
            "[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0",
            "[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground",
            "[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
            editorClassName
          )}
          editor={editor}
        />

        {/* BubbleMenu appears when text is selected */}
        {showToolbar && editable && <EditorToolbar editor={editor} />}

        {showSlashMenu && editable && <SlashMenu editor={editor} />}
      </div>
    </div>
  );
}
