import { Item, ItemGroup } from "@ctrl-ui/react/ui/item";
import { CheckIcon } from "@phosphor-icons/react";
import { hoverHighlightRef } from "@/features/overlay-chat/prompt-picker/hover-highlight";
import type { PromptMenu } from "@/features/overlay-chat/prompt-picker/use-prompt-menu";

export const PROMPT_MENU_ID = "chat-prompt-menu";

export const promptOptionId = (value: string) => `chat-prompt-${value}`;

interface PromptMenuListProps {
  activeChoice: string;
  menu: PromptMenu;
}

export const PromptMenuList = ({ activeChoice, menu }: PromptMenuListProps) => {
  if (!menu.isOpen) {
    return null;
  }
  if (menu.visible.length === 0) {
    return (
      <p className="shrink-0 px-3 text-[12px] text-white/50">
        No prompt matches
      </p>
    );
  }
  return (
    <ItemGroup
      aria-label="Prompts"
      className="echo-prompt-menu shrink-0 gap-0.5"
      id={PROMPT_MENU_ID}
      ref={hoverHighlightRef(menu.highlightAt)}
      role="listbox"
    >
      {menu.visible.map((choice, index) => (
        <Item
          aria-selected={index === menu.highlight}
          className="echo-prompt-option flex cursor-default items-center justify-between"
          id={promptOptionId(choice.value)}
          key={choice.value}
          onClick={() => menu.choose(choice.value)}
          onMouseDown={(event) => event.preventDefault()}
          role="option"
        >
          <span className="text-[13px] leading-5">{choice.label}</span>
          {choice.value === activeChoice ? (
            <CheckIcon aria-hidden="true" className="size-3.5" />
          ) : null}
        </Item>
      ))}
    </ItemGroup>
  );
};
