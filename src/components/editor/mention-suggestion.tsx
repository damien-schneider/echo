import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { FileOutput } from "lucide-react";
import { MentionList, type MentionListRef } from "./mention-list";

type MentionItem = {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
};

const MENTION_ITEMS: MentionItem[] = [
  {
    id: "output",
    label: "output",
    description: "Insert the transcribed text",
    icon: <FileOutput className="size-4" />,
  },
];

export const mentionSuggestion: Omit<
  SuggestionOptions<MentionItem>,
  "editor"
> = {
  char: "@",
  items: ({ query }) =>
    MENTION_ITEMS.filter((item) =>
      item.label.toLowerCase().startsWith(query.toLowerCase())
    ),
  render: () => {
    let component: ReactRenderer<MentionListRef> | null = null;

    return {
      onStart: (props) => {
        component = new ReactRenderer(MentionList, {
          props,
          editor: props.editor,
        });

        if (!props.clientRect) {
          return;
        }

        const rect = props.clientRect();
        if (!rect) {
          return;
        }

        component.element.style.position = "absolute";
        component.element.style.left = `${rect.left}px`;
        component.element.style.top = `${rect.bottom + 4}px`;
        component.element.style.zIndex = "50";

        document.body.appendChild(component.element);
      },

      onUpdate(props) {
        component?.updateProps(props);

        if (!component) {
          return;
        }

        if (!props.clientRect) {
          return;
        }

        const rect = props.clientRect();
        if (!rect) {
          return;
        }

        component.element.style.left = `${rect.left}px`;
        component.element.style.top = `${rect.bottom + 4}px`;
      },

      onKeyDown(props) {
        if (props.event.key === "Escape") {
          component?.destroy();
          component?.element.remove();
          return true;
        }

        return component?.ref?.onKeyDown(props) ?? false;
      },

      onExit() {
        component?.element.remove();
        component?.destroy();
      },
    };
  },
};
