import { CircleCheck, Download, RotateCcw, X } from "lucide-react";
import ProgressBar from "@/components/shared/progress-bar";
import { Button } from "@/components/ui/button";
import type { PolishModelProgress } from "@/features/polish/polish-model-state";
import { polishStatusCopy } from "@/features/polish/polish-status-copy";
import type { PolishStatus } from "@/lib/types";

interface PolishModelPanelProps {
  onClose: () => void;
  onDownload: () => Promise<void>;
  onRepair: () => Promise<void>;
  progress?: PolishModelProgress;
  status: PolishStatus;
}

const polishActionClassName =
  "rounded-full bg-white px-4 text-black hover:bg-white/88";

const StatusIcon = ({ state }: Pick<PolishStatus, "state">) => {
  if (state === "ready") {
    return (
      <CircleCheck aria-hidden="true" className="size-4 text-emerald-300" />
    );
  }
  if (state === "not_downloaded") {
    return <Download aria-hidden="true" className="size-4 text-white/55" />;
  }
  if (state === "repair") {
    return <RotateCcw aria-hidden="true" className="size-4 text-red-300" />;
  }
  return <span aria-hidden="true" className="echo-polish-phase-indicator" />;
};

const isBusyState = (state: PolishStatus["state"]) =>
  state === "preparing" ||
  state === "downloading" ||
  state === "verifying" ||
  state === "loading";

interface PolishPanelHeaderProps {
  onClose: () => void;
  status: PolishStatus;
}

const PolishPanelHeader = ({ onClose, status }: PolishPanelHeaderProps) => {
  const copy = polishStatusCopy[status.state];
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-white/8">
          <StatusIcon state={status.state} />
        </span>
        <div className="min-w-0">
          <h2 className="font-medium text-[13px] text-white">{copy.title}</h2>
          <p className="mt-1 max-w-[30ch] text-[12px] text-white/58 leading-relaxed">
            {status.state === "ready"
              ? "Select text, reopen the controls, and click Polish."
              : copy.description}
          </p>
        </div>
      </div>
      <Button
        aria-label="Close Polish model panel"
        className="size-7 rounded-full text-white/55 hover:bg-white/10 hover:text-white"
        onClick={onClose}
        size="icon-xs"
        variant="ghost"
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  );
};

interface PolishProgressProps {
  progress?: PolishModelProgress;
  state: PolishStatus["state"];
}

const determinateProgress = ({ progress, state }: PolishProgressProps) => {
  if (state === "downloading") {
    return {
      ariaLabel: "Polish model download",
      percentage: progress?.phase === "download" ? progress.percentage : 0,
    };
  }
  if (state === "verifying") {
    return {
      ariaLabel: "Polish model verification",
      percentage: progress?.phase === "verification" ? progress.percentage : 0,
    };
  }
  return null;
};

const indeterminateProgressLabel = (state: PolishStatus["state"]) => {
  if (state === "loading") {
    return "Polish model loading";
  }
  return state === "preparing" ? "Polish model preparation" : null;
};

const PolishProgress = ({ progress, state }: PolishProgressProps) => {
  const determinate = determinateProgress({ progress, state });
  if (determinate) {
    return (
      <ProgressBar
        ariaLabel={determinate.ariaLabel}
        className="echo-island-progress mt-4"
        fullWidth={true}
        progress={[
          {
            id: state,
            label: `${Math.round(determinate.percentage)}%`,
            percentage: determinate.percentage,
          },
        ]}
        showLabel={true}
        size="small"
      />
    );
  }
  const ariaLabel = indeterminateProgressLabel(state);
  if (!ariaLabel) {
    return null;
  }
  return (
    <div
      aria-label={ariaLabel}
      className="echo-polish-indeterminate-progress mt-4"
      role="progressbar"
    >
      <span aria-hidden="true" />
    </div>
  );
};

const PolishPanelAction = ({
  onClose,
  onDownload,
  onRepair,
  state,
}: Pick<PolishModelPanelProps, "onClose" | "onDownload" | "onRepair"> & {
  state: PolishStatus["state"];
}) => {
  if (state === "not_downloaded") {
    return (
      <Button className={polishActionClassName} onClick={onDownload} size="sm">
        <Download aria-hidden="true" />
        Download 2.5 GB
      </Button>
    );
  }
  if (state === "repair") {
    return (
      <Button className={polishActionClassName} onClick={onRepair} size="sm">
        <RotateCcw aria-hidden="true" />
        Repair Polish
      </Button>
    );
  }
  if (state === "ready") {
    return (
      <Button className={polishActionClassName} onClick={onClose} size="sm">
        Done
      </Button>
    );
  }
  return null;
};

export const PolishModelPanel = ({
  onClose,
  onDownload,
  onRepair,
  progress,
  status,
}: PolishModelPanelProps) => (
  <dialog
    aria-busy={isBusyState(status.state)}
    aria-label="Local Polish model"
    className="echo-island-panel m-0 border-0"
    data-polish-status-layer={status.state}
    data-state={status.state}
    open={true}
  >
    <PolishPanelHeader onClose={onClose} status={status} />

    <PolishProgress progress={progress} state={status.state} />

    <div className="mt-4 flex justify-end">
      <PolishPanelAction
        onClose={onClose}
        onDownload={onDownload}
        onRepair={onRepair}
        state={status.state}
      />
    </div>

    {status.state === "repair" ? (
      <p className="mt-3 text-[11px] text-red-200" role="alert">
        {status.message}
      </p>
    ) : null}
  </dialog>
);
