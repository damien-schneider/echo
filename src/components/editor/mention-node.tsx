"use client";

import { getMentionOnSelectItem } from "@platejs/mention";
import type { TComboboxInputElement, TMentionElement } from "platejs";
import type { PlateElementProps } from "platejs/react";
import {
  PlateElement,
  useFocused,
  useReadOnly,
  useSelected,
} from "platejs/react";
import { useState } from "react";
import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxInput,
  InlineComboboxItem,
} from "@/components/ui/inline-combobox";
import { cn } from "@/lib/utils";

// Available mentions for the @output placeholder
const MENTION_ITEMS = [
  {
    key: "output",
    text: "output",
    description: "The transcribed text placeholder",
  },
] as const;

export function MentionElement(
  props: PlateElementProps<TMentionElement> & {
    prefix?: string;
  }
) {
  const { children, className, element, prefix = "@" } = props;

  const selected = useSelected();
  const focused = useFocused();
  const readOnly = useReadOnly();

  return (
    <PlateElement
      {...props}
      as="span"
      attributes={{
        ...props.attributes,
        contentEditable: false,
        "data-slate-value": element.value,
      }}
      className={cn(
        "inline-block rounded-md bg-primary/10 px-1.5 py-0.5 align-baseline font-medium text-primary text-sm",
        !readOnly && "cursor-pointer",
        selected && focused && "ring-2 ring-ring",
        className
      )}
    >
      {prefix}
      {element.value}
      {children}
    </PlateElement>
  );
}

const onSelectItem = getMentionOnSelectItem();

export function MentionInputElement(
  props: PlateElementProps<TComboboxInputElement>
) {
  const { editor, element, children } = props;
  const [search, setSearch] = useState("");

  const filteredItems = MENTION_ITEMS.filter((item) =>
    item.text.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox
        element={element}
        setValue={setSearch}
        showTrigger={false}
        trigger="@"
        value={search}
      >
        <span className="inline-block rounded-md bg-muted px-1.5 py-0.5 align-baseline text-sm ring-ring focus-within:ring-2">
          <InlineComboboxInput />
        </span>

        <InlineComboboxContent className="my-1.5">
          <InlineComboboxEmpty>No mentions found</InlineComboboxEmpty>

          <InlineComboboxGroup>
            {filteredItems.map((item) => (
              <InlineComboboxItem
                key={item.key}
                onClick={() => onSelectItem(editor, item, search)}
                value={item.text}
              >
                <span className="flex items-center gap-2">
                  <span className="font-medium">@{item.text}</span>
                  <span className="text-muted-foreground text-xs">
                    {item.description}
                  </span>
                </span>
              </InlineComboboxItem>
            ))}
          </InlineComboboxGroup>
        </InlineComboboxContent>
      </InlineCombobox>

      {children}
    </PlateElement>
  );
}
