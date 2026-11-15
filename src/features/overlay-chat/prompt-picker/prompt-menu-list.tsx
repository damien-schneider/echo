import { Item, ItemGroup } from "@ctrl-ui/react/ui/item";
import { CheckIcon } from "@phosphor-icons/react";
import type { PromptMenu } from "@/features/overlay-chat/prompt-picker/use-prompt-menu";
import { cn } from "@/lib/utils";

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
      className="shrink-0 gap-0.5 rounded-2xl border border-white/10 bg-white/6 p-1"
      id={PROMPT_MENU_ID}
      role="listbox"
    >
      {menu.visible.map((choice, index) => (
        <Item
          aria-selected={index === menu.highlight}
          className={cn(
            "flex cursor-default items-center justify-between rounded-xl px-3 py-1.5 text-[13px] text-white/80",
            index === menu.highlight && "bg-white/12 text-white"
          )}
          id={promptOptionId(choice.value)}
          key={choice.value}
          onClick={() => menu.choose(choice.value)}
          onMouseDown={(event) => event.preventDefault()}
          role="option"
        >
          {choice.label}
          {choice.value === activeChoice ? (
            <CheckIcon aria-hidden="true" className="size-3.5" />
          ) : null}
        </Item>
      ))}
    </ItemGroup>
  );
};
