import { Button } from "@ctrl-ui/react/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@ctrl-ui/react/ui/tooltip";
import { ArrowCounterClockwiseIcon, WarningIcon } from "@phosphor-icons/react";
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
  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 first:pt-0 last:pb-0">
    <div className="min-w-0 flex-1 basis-32">
      <p className="text-label">{binding.name}</p>
      <p className="text-pretty text-caption text-muted-foreground">
        {binding.description}
      </p>
    </div>
    <div className="flex shrink-0 items-center space-x-1">
      {isEditing ? (
        <Button
          render={<div ref={(ref) => setRef(binding.id, ref)} />}
          size="sm"
          variant="surface"
        >
          {currentKeys}
        </Button>
      ) : (
        <Button
          className="font-semibold"
          onClick={() => onEdit(binding.id)}
          size="sm"
          variant="surface"
        >
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
          <TooltipTrigger
            render={<WarningIcon className="h-4 w-4 text-orange-500" />}
          />
          <TooltipContent className="max-w-xs" side="bottom">
            <p>
              This shortcut may type a character when activated on Wayland.
              Consider a shortcut without printable keys.
            </p>
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  </div>
);
