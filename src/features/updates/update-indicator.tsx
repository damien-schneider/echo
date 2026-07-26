import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import ProgressBar from "@/components/shared/progress-bar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  canInstallUpdate,
  type UpdateSnapshot,
  updateStatusText,
} from "@/features/updates/update-status";
import { useUpdateStatus } from "@/features/updates/use-update-status";
import { cn } from "@/lib/utils";

const UP_TO_DATE_LINGER_MS = 3000;

/// "Nothing to install" is only worth saying right after the user asked.
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
      <TooltipTrigger asChild>
        <Button
          className="text-muted-foreground hover:text-foreground"
          disabled={isChecking}
          onClick={onCheck}
          size="xs"
          variant="ghost"
        >
          {isChecking ? (
            <Spinner className="size-3!" />
          ) : (
            <RefreshCw className="size-3!" />
          )}
          <span className="sr-only">Check for updates</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
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

const StatusButton = ({
  isActionable,
  label,
  onAction,
  tone,
}: StatusButtonProps) => (
  <Button
    className={cn(
      "max-w-56 items-center gap-2 truncate",
      tone === "brand" && "text-brand hover:text-brand/80",
      tone === "error" && "text-destructive hover:text-destructive/80",
      tone === "muted" && "text-muted-foreground"
    )}
    disabled={!isActionable}
    onClick={onAction}
    size="xs"
    title={label}
    variant="ghost"
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
