import React, { useState, useRef, useEffect } from "react";
import type { ModelOption } from "./types";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/Select";
import { Input } from "../../ui/Input";
import { cn } from "@/lib/utils";

type ModelSelectProps = {
  value: string;
  options: ModelOption[];
  disabled?: boolean;
  placeholder?: string;
  isLoading?: boolean;
  onSelect: (value: string) => void;
  onCreate: (value: string) => void;
  onBlur: () => void;
  className?: string;
};

export const ModelSelect: React.FC<ModelSelectProps> = React.memo(
  ({
    value,
    options,
    disabled,
    placeholder,
    isLoading,
    onSelect,
    onCreate,
    onBlur,
    className = "flex-1 min-w-[360px]",
  }) => {
    const [isCreating, setIsCreating] = useState(false);
    const [customValue, setCustomValue] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      if (isCreating && inputRef.current) {
        inputRef.current.focus();
      }
    }, [isCreating]);

    const handleCreate = () => {
      const trimmed = customValue.trim();
      if (trimmed) {
        onCreate(trimmed);
        setCustomValue("");
        setIsCreating(false);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleCreate();
      } else if (e.key === "Escape") {
        setIsCreating(false);
        setCustomValue("");
      }
    };

    const selectedOption = options.find((opt) => opt.value === value);

    if (isCreating) {
      return (
        <div className={cn("relative", className)}>
          <Input
            ref={inputRef}
            type="text"
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (!customValue.trim()) {
                setIsCreating(false);
              }
              onBlur();
            }}
            placeholder="Enter custom model name..."
            disabled={disabled}
            className="text-sm"
          />
          {customValue.trim() && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              Press Enter to create
            </div>
          )}
        </div>
      );
    }

    return (
      <Select
        value={value}
        onValueChange={(val) => {
          if (val === "__create__") {
            setIsCreating(true);
          } else {
            onSelect(val);
          }
        }}
        disabled={disabled || isLoading}
      >
        <SelectTrigger className={cn("text-sm", className)} onBlur={onBlur}>
          <SelectValue placeholder={placeholder}>
            {selectedOption?.label || value || placeholder}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
            <SelectItem value="__create__" className="text-brand">
              + Create custom model...
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    );
  },
);

ModelSelect.displayName = "ModelSelect";
