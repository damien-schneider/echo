import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  <div className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
    <div className="min-w-0">
      <p className="font-medium text-sm">{binding.name}</p>
      <p className="truncate text-muted-foreground text-xs">
        {binding.description}
      </p>
    </div>
    <div className="flex shrink-0 items-center space-x-1">
      {isEditing ? (
        <Button asChild size="sm" variant="secondary">
          <div ref={(ref) => setRef(binding.id, ref)}>{currentKeys}</div>
        </Button>
      ) : (
        <Button
          className="font-semibold"
          onClick={() => onEdit(binding.id)}
          size="sm"
          variant="secondary"
        >
          {formatKeyCombination(binding.current_binding, osType)}
        </Button>
      )}
      <Button
        aria-label={`Reset ${binding.name} shortcut`}
        disabled={isUpdating}
        onClick={() => onReset(binding.id)}
        size="icon"
        variant="ghost"
      >
        <RotateCcw className="h-5 w-5" />
      </Button>
      {showWaylandWarning ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs" side="bottom">
            <p className="text-xs">
              This shortcut may type a character when activated on Wayland.
              Consider a shortcut without printable keys.
            </p>
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  </div>
);
