import { Button } from "@ctrl-ui/react/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@ctrl-ui/react/ui/tooltip";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import ProgressBar from "@/components/shared/progress-bar";
import { Spinner } from "@/components/ui/spinner";
import {
  canInstallUpdate,
  type UpdateSnapshot,
  updateStatusText,
} from "@/features/updates/update-status";
import { useUpdateStatus } from "@/features/updates/use-update-status";
import { cn } from "@/lib/utils";

const UP_TO_DATE_LINGER_MS = 3000;
const useUpToDateFlash = () => {
  const [isShown, setIsShown] = useState(false);
  useEffect(() => {
    if (!isShown) {
      return;
    }
    const timer = setTimeout(() => setIsShown(false), UP_TO_DATE_LINGER_MS);
    return () => clearTimeout(timer);
  }, [isShown]);
  return {
    hide: () => setIsShown(false),
    isShown,
    show: () => setIsShown(true),
  };
};
const CheckButton = ({
  isChecking,
  onCheck,
}: {
  isChecking: boolean;
  onCheck: () => void;
}) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            disabled={isChecking}
            onClick={onCheck}
            size="xs"
            variant="quiet"
          />
        }
      >
        {isChecking ? (
          <Spinner className="size-3!" />
        ) : (
          <ArrowClockwiseIcon className="size-3!" />
        )}
        <span className="sr-only">Check for updates</span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {isChecking ? "Checking…" : "Check for updates"}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);
interface StatusButtonProps {
  isActionable: boolean;
  label: string;
  onAction: () => void;
  tone: "brand" | "error" | "muted";
}
const buttonToneByStatus = {
  brand: "primary",
  error: "danger",
  muted: "neutral",
} as const;
const StatusButton = ({
  isActionable,
  label,
  onAction,
  tone,
}: StatusButtonProps) => (
  <Button
    className="max-w-56 items-center gap-2 truncate"
    disabled={!isActionable}
    onClick={onAction}
    size="xs"
    title={label}
    tone={buttonToneByStatus[tone]}
    variant="quiet"
  >
    {label}
  </Button>
);
const statusTone = (snapshot: UpdateSnapshot) => {
  if (snapshot.phase === "error") {
    return "error" as const;
  }
  return snapshot.phase === "available"
    ? ("brand" as const)
    : ("muted" as const);
};
export const UpdateIndicator = ({ className = "" }: { className?: string }) => {
  const { check, install, snapshot } = useUpdateStatus();
  const flash = useUpToDateFlash();
  const runCheck = async () => {
    flash.hide();
    const next = await check();
    if (next.phase === "idle") {
      flash.show();
    }
  };
  const renderContent = () => {
    if (snapshot.phase === "unsupported") {
      return null;
    }
    if (snapshot.phase === "checking") {
      return <CheckButton isChecking={true} onCheck={runCheck} />;
    }
    if (snapshot.phase === "downloading" && snapshot.progress !== null) {
      return (
        <ProgressBar
          progress={[{ id: "update", percentage: snapshot.progress }]}
          size="large"
        />
      );
    }
    const statusText = updateStatusText(snapshot);
    if (statusText) {
      return (
        <StatusButton
          isActionable={canInstallUpdate(snapshot)}
          label={statusText}
          onAction={install}
          tone={statusTone(snapshot)}
        />
      );
    }
    if (flash.isShown) {
      return (
        <StatusButton
          isActionable={false}
          label="Up to date"
          onAction={flash.hide}
          tone="muted"
        />
      );
    }
    return <CheckButton isChecking={false} onCheck={runCheck} />;
  };
  return (
    <div className={cn("flex items-center", className)}>{renderContent()}</div>
  );
};
