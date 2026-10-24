import { Button } from "@ctrl-ui/react/ui/button";
import { CircleNotchIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import type { ModelActionPresentation } from "@/features/model-download/download-state";

interface ModelActionButtonProps {
  action: ModelActionPresentation;
  isDownloaded: boolean;
  onClick: () => void;
}

export const ModelActionButton = ({
  action,
  isDownloaded,
  onClick,
}: ModelActionButtonProps) =>
  action.show ? (
    <Button
      disabled={action.disabled}
      onClick={onClick}
      size="sm"
      tone="primary"
      variant="solid"
    >
      {action.showSpinner ? (
        <CircleNotchIcon
          aria-hidden="true"
          className="mr-1 h-4 w-4 animate-spin"
        />
      ) : null}
      {action.showSpinner || isDownloaded ? null : (
        <DownloadSimpleIcon aria-hidden="true" className="mr-1 h-4 w-4" />
      )}
      {action.label}
    </Button>
  ) : null;
