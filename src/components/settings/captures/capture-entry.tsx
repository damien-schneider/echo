import { Button } from "@ctrl-ui/react/ui/button";
import { ButtonGroup } from "@ctrl-ui/react/ui/button-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@ctrl-ui/react/ui/tooltip";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { ConfirmDeleteButton } from "@/components/shared/confirm-delete-button";
import type { Capture } from "@/lib/types";

const COPIED_FEEDBACK_MS = 2000;
interface CaptureEntryProps {
  capture: Capture;
  onDelete: (id: number) => Promise<void>;
}
export const CaptureEntry = ({ capture, onDelete }: CaptureEntryProps) => {
  const [showCopied, setShowCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(capture.content);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), COPIED_FEEDBACK_MS);
    } catch (error) {
      console.error("Failed to copy the capture:", error);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <p className="font-medium text-sm">
            {capture.app_name ?? "Unknown app"}
          </p>
          <p className="text-text/50 text-xs">
            {formatDistanceToNow(new Date(capture.timestamp * 1000), {
              addSuffix: true,
            })}
          </p>
        </div>
        <TooltipProvider>
          <ButtonGroup>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    iconOnly
                    onClick={handleCopy}
                    size="xs"
                    variant="surface"
                  />
                }
              >
                {showCopied ? (
                  <CheckIcon height={16} width={16} />
                ) : (
                  <CopyIcon height={16} width={16} />
                )}
              </TooltipTrigger>
              <TooltipContent>
                {showCopied ? "Copied!" : "Copy text"}
              </TooltipContent>
            </Tooltip>
            <ConfirmDeleteButton
              label="Delete capture"
              onDelete={async () => {
                try {
                  await onDelete(capture.id);
                } catch (error) {
                  console.error("Failed to delete the capture:", error);
                }
              }}
            />
          </ButtonGroup>
        </TooltipProvider>
      </div>
      <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-sm text-text/90">
        {capture.content}
      </p>
    </div>
  );
};
