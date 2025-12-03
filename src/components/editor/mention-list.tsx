"use client";

import { FileOutput } from "lucide-react";
import {
  type ForwardedRef,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { cn } from "@/lib/utils";

type MentionItem = {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
};

export const MENTION_ITEMS: MentionItem[] = [
  {
    id: "output",
    label: "output",
    description: "Insert the transcribed text",
    icon: <FileOutput className="size-4" />,
  },
];

type MentionListProps = {
  items: MentionItem[];
  command: (item: { id: string; label: string }) => void;
};

export type MentionListRef = {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

// biome-ignore lint: ReactRenderer from tiptap requires forwardRef for ref access
export const MentionList = forwardRef(
  (props: MentionListProps, ref: ForwardedRef<MentionListRef>) => {
    const { items, command } = props;
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selectItem = (index: number) => {
      const item = items[index];
      if (item) {
        command({ id: item.id, label: item.label });
      }
    };

    const upHandler = () => {
      setSelectedIndex((selectedIndex + items.length - 1) % items.length);
    };

    const downHandler = () => {
      setSelectedIndex((selectedIndex + 1) % items.length);
    };

    const enterHandler = () => {
      selectItem(selectedIndex);
    };

    // biome-ignore lint/correctness/useExhaustiveDependencies: reset when items array changes
    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === "ArrowUp") {
          upHandler();
          return true;
        }

        if (event.key === "ArrowDown") {
          downHandler();
          return true;
        }

        if (event.key === "Enter") {
          enterHandler();
          return true;
        }

        return false;
      },
    }));

    if (items.length === 0) {
      return null;
    }

    return (
      <div className="max-h-80 w-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
        {items.map((item, index) => (
          <button
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
              index === selectedIndex
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent/50"
            )}
            key={item.id}
            onClick={() => selectItem(index)}
            type="button"
          >
            <div className="flex size-8 items-center justify-center rounded-md border bg-background">
              {item.icon}
            </div>
            <div className="flex-1">
              <div className="font-medium text-sm">@{item.label}</div>
              <div className="text-muted-foreground text-xs">
                {item.description}
              </div>
            </div>
          </button>
        ))}
      </div>
    );
  }
);

MentionList.displayName = "MentionList";
