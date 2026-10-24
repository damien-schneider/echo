import { Button } from "@ctrl-ui/react/ui/button";
import { ButtonGroup } from "@ctrl-ui/react/ui/button-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@ctrl-ui/react/ui/tooltip";
import { CheckIcon, FolderOpenIcon, TrashIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { getNormalizedOsPlatform } from "@/lib/os";

const DELETE_CONFIRM_MS = 3000;
const FILE_MANAGER_PLACE = {
  linux: "in its folder",
  mac: "in Finder",
  windows: "in File Explorer",
} as const;

interface ModelFileActionsProps {
  disabled: boolean;
  modelName: string;
  onDelete: () => Promise<void>;
  onReveal: () => Promise<void>;
}

export const ModelFileActions = ({
  disabled,
  modelName,
  onDelete,
  onReveal,
}: ModelFileActionsProps) => {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileManagerPlace = FILE_MANAGER_PLACE[getNormalizedOsPlatform()];

  useEffect(() => {
    if (!isConfirmingDelete) {
      return;
    }
    const timer = setTimeout(
      () => setIsConfirmingDelete(false),
      DELETE_CONFIRM_MS
    );
    return () => clearTimeout(timer);
  }, [isConfirmingDelete]);

  const handleDelete = async () => {
    if (!isConfirmingDelete) {
      setIsConfirmingDelete(true);
      return;
    }
    setIsConfirmingDelete(false);
    setIsDeleting(true);
    try {
      await onDelete();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <TooltipProvider>
      <ButtonGroup>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={`Show ${modelName} ${fileManagerPlace}`}
                disabled={disabled}
                iconOnly
                onClick={onReveal}
                size="xs"
                variant="surface"
              />
            }
          >
            <FolderOpenIcon aria-hidden="true" height={16} width={16} />
          </TooltipTrigger>
          <TooltipContent>Show {fileManagerPlace}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={
                  isConfirmingDelete
                    ? `Confirm deleting ${modelName}`
                    : `Delete ${modelName}`
                }
                disabled={disabled || isDeleting}
                iconOnly
                onClick={handleDelete}
                size="xs"
                tone={isConfirmingDelete ? "danger" : "neutral"}
                variant={isConfirmingDelete ? "ghost" : "surface"}
              />
            }
          >
            {isConfirmingDelete ? (
              <CheckIcon aria-hidden="true" height={16} width={16} />
            ) : (
              <TrashIcon aria-hidden="true" height={16} width={16} />
            )}
          </TooltipTrigger>
          <TooltipContent>
            {isConfirmingDelete ? "Click again to delete" : "Delete"}
          </TooltipContent>
        </Tooltip>
      </ButtonGroup>
    </TooltipProvider>
  );
};
