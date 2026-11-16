import { Button } from "@ctrl-ui/react/ui/button";
import { WarningCircleIcon } from "@phosphor-icons/react";

interface HistoryLoadErrorProps {
  message: string;
  onRetry: () => void;
  title: string;
}

export const HistoryLoadError = ({
  message,
  onRetry,
  title,
}: HistoryLoadErrorProps) => (
  <div
    className="flex flex-col items-center gap-3 px-4 py-8 text-center text-text/60"
    role="alert"
  >
    <WarningCircleIcon className="h-10 w-10 opacity-40" />
    <div>
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm">{message}</p>
    </div>
    <Button onClick={onRetry} size="sm" variant="surface">
      Retry
    </Button>
  </div>
);
