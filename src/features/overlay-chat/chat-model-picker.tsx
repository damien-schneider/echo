import { Settings2 } from "lucide-react";
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
  onManageModels: () => void;
  onSelect: (id: string) => void;
  options: ChatModelOption[];
  selected: ChatModelOption | null;
}

const ModelSelect = ({
  disabled,
  mode,
  onManageModels,
  onSelect,
  options,
  selected,
}: ModelSelectProps) => {
  if (options.length === 0) {
    return (
      <Button
        aria-label={`Set up ${mode} chat model`}
        className="h-8 min-w-0 flex-1 justify-start gap-2 rounded-full border border-white/10 bg-white/8 px-3 text-[11px] text-white/78 hover:bg-white/12 hover:text-white"
        disabled={disabled}
        onClick={onManageModels}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Settings2 aria-hidden="true" className="size-3 shrink-0" />
        <span className="truncate">Set up {mode} model</span>
      </Button>
    );
  }
  return (
    <Select disabled={disabled} onValueChange={onSelect} value={selected?.id}>
      <SelectTrigger
        aria-label="Provider and model"
        className="h-8 min-w-0 flex-1 rounded-full border-white/10 bg-white/8 px-3 text-[11px] text-white shadow-none hover:bg-white/12 focus:ring-white/25 [&>span]:min-w-0 [&>span]:truncate"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-w-[calc(100vw-24px)]">
        {options.map((option) => (
          <SelectItem
            className="max-w-full overflow-hidden"
            key={option.id}
            value={option.id}
          >
            <span className="block max-w-[min(28rem,calc(100vw-5rem))] truncate">
              {option.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

interface ChatModePickerProps {
  disabled: boolean;
  mode: ChatModelMode;
  onSelect: (mode: ChatModelMode) => void;
}

export const ChatModePicker = ({
  disabled,
  mode,
  onSelect,
}: ChatModePickerProps) => (
  <div className="flex shrink-0 rounded-full border border-white/10 bg-white/7 p-0.5">
    <ModeButton
      disabled={disabled}
      isActive={mode === CHAT_MODEL_MODES.local}
      mode={CHAT_MODEL_MODES.local}
      onSelect={onSelect}
    >
      Local
    </ModeButton>
    <ModeButton
      disabled={disabled}
      isActive={mode === CHAT_MODEL_MODES.cloud}
      mode={CHAT_MODEL_MODES.cloud}
      onSelect={onSelect}
    >
      Cloud
    </ModeButton>
  </div>
);

type ChatModelPickerProps = ModelSelectProps;

export const ChatModelPicker = ({
  disabled,
  mode,
  onManageModels,
  onSelect,
  options,
  selected,
}: ChatModelPickerProps) => (
  <div className="flex min-w-0 flex-1 items-center gap-1">
    <ModelSelect
      disabled={disabled}
      mode={mode}
      onManageModels={onManageModels}
      onSelect={onSelect}
      options={options}
      selected={selected}
    />
    {options.length > 0 ? (
      <Button
        aria-label="Manage chat models"
        className="size-7 shrink-0 rounded-full text-white/55 hover:bg-white/10 hover:text-white"
        disabled={disabled}
        onClick={onManageModels}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <Settings2 aria-hidden="true" className="size-3.5" />
      </Button>
    ) : null}
  </div>
);
