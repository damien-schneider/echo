"use client";

import type { Editor, Range } from "@tiptap/react";
import {
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Type,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const SLASH_COMMAND_REGEX = /\/(\w*)$/;

type SlashMenuItem = {
  title: string;
  description: string;
  icon: React.ReactNode;
  command: (editor: Editor, range: Range) => void;
  aliases?: string[];
};

const SLASH_MENU_ITEMS: SlashMenuItem[] = [
  {
    title: "Text",
    description: "Plain text paragraph",
    icon: <Type className="size-4" />,
    aliases: ["paragraph", "p"],
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setParagraph().run();
    },
  },
  {
    title: "Heading 1",
    description: "Large section heading",
    icon: <Heading1 className="size-4" />,
    aliases: ["h1", "title"],
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
    },
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    icon: <Heading2 className="size-4" />,
    aliases: ["h2", "subtitle"],
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
    },
  },
  {
    title: "Heading 3",
    description: "Small section heading",
    icon: <Heading3 className="size-4" />,
    aliases: ["h3"],
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
    },
  },
  {
    title: "Bullet List",
    description: "Unordered list with bullet points",
    icon: <List className="size-4" />,
    aliases: ["ul", "unordered", "bullets"],
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: "Numbered List",
    description: "Ordered list with numbers",
    icon: <ListOrdered className="size-4" />,
    aliases: ["ol", "ordered", "numbers"],
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: "Task List",
    description: "Checklist with checkboxes",
    icon: <ListChecks className="size-4" />,
    aliases: ["checkbox", "todo", "checklist"],
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    title: "Quote",
    description: "Capture a quotation",
    icon: <Quote className="size-4" />,
    aliases: ["blockquote", "cite"],
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setBlockquote().run();
    },
  },
  {
    title: "Code Block",
    description: "Code snippet with syntax highlighting",
    icon: <Code className="size-4" />,
    aliases: ["pre", "codeblock"],
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setCodeBlock().run();
    },
  },
  {
    title: "Divider",
    description: "Horizontal rule separator",
    icon: <Minus className="size-4" />,
    aliases: ["hr", "separator", "line"],
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
];

type SlashMenuProps = {
  editor: Editor;
};

export function SlashMenu({ editor }: SlashMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [range, setRange] = useState<Range | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const filteredItems = SLASH_MENU_ITEMS.filter((item) => {
    const searchTerms = [item.title, ...(item.aliases || [])].map((s) =>
      s.toLowerCase()
    );
    return searchTerms.some((term) => term.includes(query.toLowerCase()));
  });

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!isOpen) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((prev) =>
          prev < filteredItems.length - 1 ? prev + 1 : 0
        );
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredItems.length - 1
        );
      } else if (event.key === "Enter") {
        event.preventDefault();
        const item = filteredItems[selectedIndex];
        if (item && range) {
          item.command(editor, range);
          setIsOpen(false);
        }
      } else if (event.key === "Escape") {
        setIsOpen(false);
      }
    },
    [isOpen, filteredItems, selectedIndex, range, editor]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    const handleUpdate = () => {
      const { state } = editor;
      const { selection } = state;
      const { $from } = selection;

      // Get text on current line
      const lineStart = $from.start();
      const textOnLine = state.doc.textBetween(
        lineStart,
        $from.pos,
        "\0",
        "\0"
      );

      // Check if we have a slash command
      const slashMatch = textOnLine.match(SLASH_COMMAND_REGEX);

      if (slashMatch) {
        const searchQuery = slashMatch[1];
        setQuery(searchQuery);
        setSelectedIndex(0);

        // Calculate position
        const coords = editor.view.coordsAtPos(
          $from.pos - slashMatch[0].length
        );
        const editorRect = editor.view.dom.getBoundingClientRect();

        setPosition({
          top: coords.bottom - editorRect.top + 4,
          left: coords.left - editorRect.left,
        });

        setRange({
          from: $from.pos - slashMatch[0].length,
          to: $from.pos,
        });

        setIsOpen(true);
      } else {
        setIsOpen(false);
      }
    };

    editor.on("update", handleUpdate);
    editor.on("selectionUpdate", handleUpdate);

    return () => {
      editor.off("update", handleUpdate);
      editor.off("selectionUpdate", handleUpdate);
    };
  }, [editor]);

  // Reset index when filtered items change
  useEffect(() => {
    setSelectedIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only reset on query change, not on filteredItems
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (menuRef.current && isOpen) {
      const selectedElement = menuRef.current.querySelector(
        `[data-index="${selectedIndex}"]`
      );
      selectedElement?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, isOpen]);

  if (!isOpen || filteredItems.length === 0) {
    return null;
  }

  return (
    <div
      className="absolute z-50 max-h-80 w-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
      ref={menuRef}
      style={{ top: position.top, left: position.left }}
    >
      {filteredItems.map((item, index) => (
        <button
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
            index === selectedIndex
              ? "bg-accent text-accent-foreground"
              : "hover:bg-accent/50"
          )}
          data-index={index}
          key={item.title}
          onClick={() => {
            if (range) {
              item.command(editor, range);
              setIsOpen(false);
            }
          }}
          type="button"
        >
          <div className="flex size-8 items-center justify-center rounded-md border bg-background">
            {item.icon}
          </div>
          <div className="flex-1">
            <div className="font-medium text-sm">{item.title}</div>
            <div className="text-muted-foreground text-xs">
              {item.description}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
