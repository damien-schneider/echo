import { Button } from "@ctrl-ui/react/ui/button";
import { ButtonGroup } from "@ctrl-ui/react/ui/button-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@ctrl-ui/react/ui/tooltip";
import { FolderOpenIcon } from "@phosphor-icons/react";
import { ConfirmDeleteButton } from "@/components/shared/confirm-delete-button";
import { getNormalizedOsPlatform } from "@/lib/os";

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
  const fileManagerPlace = FILE_MANAGER_PLACE[getNormalizedOsPlatform()];
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
        <ConfirmDeleteButton
          disabled={disabled}
          label={`Delete ${modelName}`}
          onDelete={onDelete}
        />
      </ButtonGroup>
    </TooltipProvider>
  );
};
