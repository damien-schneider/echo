import { Check, Copy, Trash2 } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type InputEntry = {
  id: number;
  app_name: string;
  app_bundle_id: string | null;
  window_title: string | null;
  content: string;
  timestamp: number;
  duration_ms: number;
};

type KeyboardInputEntryProps = {
  entry: InputEntry;
  onDelete: (id: number) => Promise<void>;
};

export const KeyboardInputEntry: React.FC<KeyboardInputEntryProps> = ({
  entry,
  onDelete,
}) => {
  const [showCopied, setShowCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(entry.content);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  };

  const handleDeleteClick = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }

    try {
      await onDelete(entry.id);
    } catch (error) {
      console.error("Failed to delete entry:", error);
      setConfirmDelete(false);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  };

  const formatDuration = (durationMs: number) => {
    if (durationMs < 1000) {
      return `${durationMs}ms`;
    }
    const seconds = Math.round(durationMs / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <p className="font-medium text-sm">{entry.app_name}</p>
          <p className="text-text/50 text-xs">
            {formatTimestamp(entry.timestamp)}
            {entry.duration_ms > 0 && (
              <span className="ml-2">
                • {formatDuration(entry.duration_ms)}
              </span>
            )}
          </p>
        </div>
        <TooltipProvider>
          <ButtonGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleCopyText}
                  size="icon-xs"
                  variant="secondary"
                >
                  {showCopied ? (
                    <Check height={16} width={16} />
                  ) : (
                    <Copy height={16} width={16} />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {showCopied ? "Copied!" : "Copy text"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleDeleteClick}
                  size="icon-xs"
                  variant={confirmDelete ? "ghostDestructive" : "secondary"}
                >
                  {confirmDelete ? (
                    <Check height={16} width={16} />
                  ) : (
                    <Trash2 height={16} width={16} />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {confirmDelete ? "Click again to confirm" : "Delete entry"}
              </TooltipContent>
            </Tooltip>
          </ButtonGroup>
        </TooltipProvider>
      </div>
      <p className="rounded-md bg-muted/50 p-2 font-mono text-sm text-text/90">
        {entry.content}
      </p>
    </div>
  );
};
