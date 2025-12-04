"use client";

import { Plate, PlateContent } from "platejs/react";
import { cn } from "@/lib/utils";
import { EditorToolbar } from "./toolbar";
import { useMarkdownEditor } from "./use-markdown-editor";
import "./editor.css";

type MarkdownEditorProps = {
  value?: string;
  onChange?: (markdown: string) => void;
  placeholder?: string;
  className?: string;
  editorClassName?: string;
  autoFocus?: boolean;
  editable?: boolean;
  showToolbar?: boolean;
  /** Enable @mention functionality with custom items like @output */
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
  showMentionMenu = false,
}: MarkdownEditorProps) {
  const { editor, handleChange } = useMarkdownEditor({
    content: value,
    onUpdate: onChange,
    placeholder,
    autoFocus,
    editable,
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
    <div
      className={cn(
        "relative flex flex-col",
        "**:selection:bg-blue-500/35! dark:**:selection:bg-blue-400/45!",

        className
      )}
    >
      <Plate editor={editor} onChange={handleChange}>
        {showToolbar && editable && (
          <div className="w-fit px-3">
            <EditorToolbar className="w-fit" />
          </div>
        )}
        <PlateContent
          autoFocus={autoFocus}
          className={cn(
            "prose prose-sm dark:prose-invert max-w-none",
            "min-h-[200px] w-full rounded-lg border border-input bg-background px-4 py-3",
            "focus:outline-none",
            "**:data-slate-placeholder:text-muted-foreground **:data-slate-placeholder:opacity-100",
            editorClassName
          )}
          placeholder={placeholder}
          readOnly={!editable}
        />
      </Plate>
    </div>
  );
}
