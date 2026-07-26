import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CHAT_MODEL_MODES,
  type ChatModelMode,
  type ChatModelOption,
} from "@/features/overlay-chat/chat";
import { cn } from "@/lib/utils";

interface ModeButtonProps {
  children: ReactNode;
  disabled: boolean;
  isActive: boolean;
  mode: ChatModelMode;
  onSelect: (mode: ChatModelMode) => void;
}

const ModeButton = ({
  children,
  disabled,
  isActive,
  mode,
  onSelect,
}: ModeButtonProps) => (
  <Button
    className={cn(
      "rounded-full px-3 py-1.5 text-[11px] text-white/62",
      isActive &&
        (mode === CHAT_MODEL_MODES.local
          ? "bg-white text-black"
          : "bg-sky-300 text-sky-950 ring-1 ring-sky-100/70")
    )}
    disabled={disabled}
    onClick={() => onSelect(mode)}
    size="xs"
    type="button"
    variant="ghost"
  >
    {children}
  </Button>
);

interface ModelSelectProps {
  disabled: boolean;
  mode: ChatModelMode;
  onSelect: (id: string) => void;
  options: ChatModelOption[];
  selected: ChatModelOption | null;
}

const ModelSelect = ({
  disabled,
  mode,
  onSelect,
  options,
  selected,
}: ModelSelectProps) => (
  <Select
    disabled={disabled || options.length === 0}
    onValueChange={onSelect}
    value={selected?.id}
  >
    <SelectTrigger
      aria-label="Provider and model"
      className="h-8 min-w-0 flex-1 rounded-full border-white/10 bg-white/8 px-3 text-[11px] text-white shadow-none hover:bg-white/12 focus:ring-white/25"
    >
      <SelectValue placeholder={`No ${mode} model configured`} />
    </SelectTrigger>
    <SelectContent>
      {options.map((option) => (
        <SelectItem key={option.id} value={option.id}>
          {option.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

interface ChatModelPickerProps extends ModelSelectProps {
  allOptions: ChatModelOption[];
  onModeSelect: (mode: ChatModelMode) => void;
}

export const ChatModelPicker = ({
  allOptions,
  disabled,
  mode,
  onModeSelect,
  onSelect,
  options,
  selected,
}: ChatModelPickerProps) => (
  <div className="flex min-w-0 flex-1 items-center gap-2">
    <div className="flex shrink-0 rounded-full border border-white/10 bg-white/7 p-0.5">
      <ModeButton
        disabled={disabled || !allOptions.some((option) => option.isLocal)}
        isActive={mode === CHAT_MODEL_MODES.local}
        mode={CHAT_MODEL_MODES.local}
        onSelect={onModeSelect}
      >
        Local
      </ModeButton>
      <ModeButton
        disabled={disabled || !allOptions.some((option) => !option.isLocal)}
        isActive={mode === CHAT_MODEL_MODES.cloud}
        mode={CHAT_MODEL_MODES.cloud}
        onSelect={onModeSelect}
      >
        Cloud
      </ModeButton>
    </div>
    <ModelSelect
      disabled={disabled}
      mode={mode}
      onSelect={onSelect}
      options={options}
      selected={selected}
    />
  </div>
);
