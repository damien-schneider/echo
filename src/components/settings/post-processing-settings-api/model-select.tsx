import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ModelOption } from "./types";

interface ModelSelectProps {
  value: string;
  options: ModelOption[];
  disabled?: boolean;
  placeholder?: string;
  isLoading?: boolean;
  allowCreate?: boolean;
  onSelect: (value: string) => void;
  onCreate?: (value: string) => void;
  onBlur: () => void;
  className?: string;
}

export const ModelSelect: React.FC<ModelSelectProps> = ({
  value,
  options,
  disabled,
  placeholder = "Select model...",
  isLoading,
  allowCreate = true,
  onSelect,
  onCreate,
  onBlur,
  className = "flex-1 min-w-[360px]",
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedOption = options.find((opt) => opt.value === value);

  const handleSelect = (selectedValue: string) => {
    onSelect(selectedValue);
    setOpen(false);
    setSearch("");
  };

  const handleCreate = () => {
    const trimmed = search.trim();
    if (trimmed && onCreate) {
      onCreate(trimmed);
      setOpen(false);
      setSearch("");
    }
  };

  const filteredOptions = options.filter(
    (opt) =>
      opt.label.toLowerCase().includes(search.toLowerCase()) ||
      opt.value.toLowerCase().includes(search.toLowerCase())
  );

  const showCreateOption =
    allowCreate &&
    search.trim() &&
    !options.some(
      (opt) =>
        opt.value.toLowerCase() === search.trim().toLowerCase() ||
        opt.label.toLowerCase() === search.trim().toLowerCase()
    );

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          className={cn("justify-between font-normal text-sm", className)}
          disabled={disabled || isLoading}
          onBlur={onBlur}
          role="combobox"
        >
          <span className="truncate">
            {selectedOption?.label || value || placeholder}
          </span>
          <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            onValueChange={setSearch}
            placeholder={
              allowCreate
                ? "Search or enter custom model..."
                : "Search model..."
            }
            value={search}
          />
          <CommandList>
            <CommandEmpty>
              {allowCreate && search.trim() ? (
                <button
                  className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-brand text-sm hover:bg-accent"
                  onClick={handleCreate}
                  type="button"
                >
                  <PlusIcon className="h-4 w-4" />
                  Create "{search.trim()}"
                </button>
              ) : (
                "No model found."
              )}
            </CommandEmpty>
            <CommandGroup heading="Available Models">
              {filteredOptions.map((option) => (
                <CommandItem
                  className={cn(
                    "cursor-pointer",
                    value === option.value && "bg-foreground/10 text-foreground"
                  )}
                  key={option.value}
                  onSelect={() => handleSelect(option.value)}
                  value={option.value}
                >
                  <div className="flex w-full items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-sm tracking-tight">
                        {option.label}
                      </div>
                    </div>
                    {value === option.value && (
                      <div className="flex items-center gap-2">
                        <CheckIcon className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                </CommandItem>
              ))}
              {showCreateOption && (
                <CommandItem
                  className="cursor-pointer text-brand"
                  onSelect={handleCreate}
                  value={`__create__${search.trim()}`}
                >
                  <div className="flex items-center gap-2">
                    <PlusIcon className="h-4 w-4" />
                    <span>Create "{search.trim()}"</span>
                  </div>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

ModelSelect.displayName = "ModelSelect";
