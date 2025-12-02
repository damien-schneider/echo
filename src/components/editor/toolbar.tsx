"use client";

import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Bold, Code, Italic, Link2, Strikethrough } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type EditorToolbarProps = {
  editor: Editor;
  className?: string;
};

export function EditorToolbar({ editor, className }: EditorToolbarProps) {
  const [linkUrl, setLinkUrl] = useState("");
  const [isLinkPopoverOpen, setIsLinkPopoverOpen] = useState(false);

  const setLink = useCallback(() => {
    if (!linkUrl) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    const url = linkUrl.startsWith("http") ? linkUrl : `https://${linkUrl}`;
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    setLinkUrl("");
    setIsLinkPopoverOpen(false);
  }, [editor, linkUrl]);

  const openLinkPopover = useCallback(() => {
    const previousUrl = editor.getAttributes("link").href;
    setLinkUrl(previousUrl || "");
    setIsLinkPopoverOpen(true);
  }, [editor]);

  return (
    <BubbleMenu editor={editor}>
      <div
        className={cn(
          "flex items-center gap-1 rounded-lg border border-border bg-popover p-1 shadow-lg",
          className
        )}
      >
        {/* Text formatting */}
        <ToolbarButton
          active={editor.isActive("bold")}
          icon={<Bold className="size-4" />}
          onClick={() => editor.chain().focus().toggleBold().run()}
          tooltip="Bold (⌘B)"
        />
        <ToolbarButton
          active={editor.isActive("italic")}
          icon={<Italic className="size-4" />}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          tooltip="Italic (⌘I)"
        />
        <ToolbarButton
          active={editor.isActive("strike")}
          icon={<Strikethrough className="size-4" />}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          tooltip="Strikethrough"
        />
        <ToolbarButton
          active={editor.isActive("code")}
          icon={<Code className="size-4" />}
          onClick={() => editor.chain().focus().toggleCode().run()}
          tooltip="Inline Code (⌘E)"
        />

        <ToolbarDivider />

        {/* Link */}
        <Popover onOpenChange={setIsLinkPopoverOpen} open={isLinkPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              className={cn(
                "size-8 p-0",
                editor.isActive("link") && "bg-accent text-accent-foreground"
              )}
              onClick={openLinkPopover}
              size="sm"
              variant="ghost"
            >
              <Link2 className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80">
            <div className="flex flex-col gap-2">
              <label className="font-medium text-sm" htmlFor="link-url-input">
                URL
              </label>
              <div className="flex gap-2">
                <Input
                  id="link-url-input"
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && setLink()}
                  placeholder="https://example.com"
                  value={linkUrl}
                />
                <Button onClick={setLink} size="sm">
                  {editor.isActive("link") ? "Update" : "Add"}
                </Button>
              </div>
              {editor.isActive("link") && (
                <Button
                  className="w-full"
                  onClick={() => {
                    editor.chain().focus().unsetLink().run();
                    setIsLinkPopoverOpen(false);
                  }}
                  size="sm"
                  variant="destructive"
                >
                  Remove Link
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </BubbleMenu>
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

function ToolbarDivider() {
  return <div className="mx-1 h-6 w-px bg-border" />;
}
