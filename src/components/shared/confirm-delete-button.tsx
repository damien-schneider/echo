import { Button } from "@ctrl-ui/react/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@ctrl-ui/react/ui/tooltip";
import { CheckIcon, TrashIcon } from "@phosphor-icons/react";
import { useSecondClickConfirmation } from "@/hooks/use-second-click-confirmation";

interface ConfirmDeleteButtonProps {
  disabled?: boolean;
  label: string;
  onDelete: () => Promise<void>;
}

export const ConfirmDeleteButton = ({
  disabled = false,
  label,
  onDelete,
}: ConfirmDeleteButtonProps) => {
  const { isAwaitingConfirmation, isRunning, runOnSecondClick } =
    useSecondClickConfirmation();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={
              isAwaitingConfirmation
                ? `${label}: click again to confirm`
                : label
            }
            disabled={disabled || isRunning}
            iconOnly
            onClick={() => runOnSecondClick(onDelete)}
            size="xs"
            tone={isAwaitingConfirmation ? "danger" : "neutral"}
            variant={isAwaitingConfirmation ? "ghost" : "surface"}
          />
        }
      >
        {isAwaitingConfirmation ? (
          <CheckIcon aria-hidden="true" height={16} width={16} />
        ) : (
          <TrashIcon aria-hidden="true" height={16} width={16} />
        )}
      </TooltipTrigger>
      <TooltipContent>
        {isAwaitingConfirmation ? "Click again to confirm" : label}
      </TooltipContent>
    </Tooltip>
  );
};
