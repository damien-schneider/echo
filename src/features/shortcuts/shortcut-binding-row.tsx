import { Button } from "@ctrl-ui/react/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@ctrl-ui/react/ui/tooltip";
import {
  ArrowCounterClockwiseIcon,
  KeyboardIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { SettingRow } from "@/features/settings/setting-row";
import type { ShortcutBinding } from "@/lib/types";
import { formatKeyCombination, type OSType } from "@/lib/utils/keyboard";

interface ShortcutBindingRowProps {
  binding: ShortcutBinding;
  currentKeys: string;
  isEditing: boolean;
  isUpdating: boolean;
  onEdit: (id: string) => Promise<void>;
  onReset: (id: string) => Promise<void>;
  osType: OSType;
  setRef: (id: string, ref: HTMLDivElement | null) => void;
  showWaylandWarning: boolean;
}
export const ShortcutBindingRow = ({
  binding,
  currentKeys,
  isEditing,
  isUpdating,
  onEdit,
  onReset,
  osType,
  setRef,
  showWaylandWarning,
}: ShortcutBindingRowProps) => (
  <SettingRow
    description={binding.description}
    icon={<KeyboardIcon className="h-4 w-4" />}
    title={binding.name}
  >
    <div className="flex items-center space-x-1">
      {isEditing ? (
        <Button
          render={<div ref={(ref) => setRef(binding.id, ref)} />}
          size="sm"
          variant="surface"
        >
          {currentKeys}
        </Button>
      ) : (
        <Button onClick={() => onEdit(binding.id)} size="sm" variant="surface">
          {formatKeyCombination(binding.current_binding, osType)}
        </Button>
      )}
      <Button
        aria-label={`Reset ${binding.name} shortcut`}
        disabled={isUpdating}
        iconOnly
        onClick={() => onReset(binding.id)}
        size="md"
        variant="ghost"
      >
        <ArrowCounterClockwiseIcon className="h-5 w-5" />
      </Button>
      {showWaylandWarning ? (
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" />}>
            <WarningIcon className="size-4 text-warning" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs" side="bottom">
            <p>
              This shortcut may type a character when activated on Wayland.
              Consider a shortcut without printable keys.
            </p>
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  </SettingRow>
);
