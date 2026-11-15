import { type KeyboardEvent, type RefObject, useState } from "react";
import {
  matchingChoices,
  movedHighlight,
  slashQuery,
} from "@/features/overlay-chat/prompt-picker/prompt-menu";
import type { ChatPromptChoice } from "@/features/overlay-chat/prompt-picker/use-chat-prompt";

type MenuOpener = "closed" | "pill" | "slash";

interface PromptMenuOptions {
  chatPrompt: ChatPromptChoice;
  input: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onChoose: (choice: string) => void;
  setInput: (value: string) => void;
}

export const usePromptMenu = ({
  chatPrompt,
  input,
  inputRef,
  onChoose,
  setInput,
}: PromptMenuOptions) => {
  const [opener, setOpener] = useState<MenuOpener>("closed");
  const [highlight, setHighlight] = useState(0);
  const query = opener === "slash" ? (slashQuery(input) ?? "") : "";
  const visible = matchingChoices(chatPrompt.choices, query);
  const close = () => {
    setOpener("closed");
    inputRef.current?.focus();
  };
  const choose = (choice: string) => {
    if (opener === "slash") {
      setInput("");
    }
    close();
    onChoose(choice);
  };
  const handleKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((current) => movedHighlight(current, step, visible.length));
    } else if (event.key === "Enter") {
      const highlighted = visible.at(highlight);
      if (highlighted) {
        choose(highlighted.value);
      }
    } else if (event.key === "Escape") {
      close();
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };
  return {
    choose,
    highlight,
    isOpen: opener !== "closed",
    onInput: (value: string) => {
      setInput(value);
      setHighlight(0);
      if (slashQuery(value) !== null) {
        setOpener("slash");
      } else if (opener === "slash") {
        setOpener("closed");
      }
    },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (opener !== "closed") {
        handleKey(event);
      }
    },
    toggle: () => {
      setHighlight(
        Math.max(
          0,
          visible.findIndex(
            (choice) => choice.value === chatPrompt.activeChoice
          )
        )
      );
      setOpener((current) => (current === "closed" ? "pill" : "closed"));
      inputRef.current?.focus();
    },
    visible,
  };
};

export type PromptMenu = ReturnType<typeof usePromptMenu>;
