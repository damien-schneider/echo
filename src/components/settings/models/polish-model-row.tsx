import { Button } from "@ctrl-ui/react/ui/button";
import { CircleNotchIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import {
  ModelRow,
  type ModelRowStatus,
} from "@/components/model-selector/model-row";
import {
  polishModelId,
  polishModelName,
} from "@/features/polish/polish-model-state";
import {
  type ModelFootprint,
  ModelFootprintSchema,
  type PolishStatus,
} from "@/lib/types";

const MODEL_USES =
  "Runs post-processing, voice commands, Polish, meeting summaries and chat on this computer.";

const rowStatus = (status: PolishStatus): ModelRowStatus | undefined => {
  switch (status.state) {
    case "repair":
      return { message: status.message, tone: "error" };
    case "loading":
      return {
        message: "Loading into memory. The first start can take a moment.",
        tone: "muted",
      };
    case "preparing":
      return { message: "Preparing…", tone: "muted" };
    case "verifying":
      return {
        message: "Checking the model before it can run.",
        tone: "muted",
      };
    default:
      return;
  }
};

const usePolishModelFootprint = () => {
  const [footprint, setFootprint] = useState<ModelFootprint>();
  useEffect(() => {
    let isCurrent = true;
    invoke<unknown>("get_polish_model_footprint")
      .then((payload) => {
        if (isCurrent) {
          setFootprint(ModelFootprintSchema.parse(payload));
        }
      })
      .catch((error: unknown) => {
        console.error(`Failed to read the ${polishModelName} footprint`, error);
      });
    return () => {
      isCurrent = false;
    };
  }, []);
  return footprint;
};

interface PolishModelActionProps {
  onDownload: () => Promise<void>;
  onRepair: () => Promise<void>;
  state: PolishStatus["state"];
}

const PolishModelAction = ({
  onDownload,
  onRepair,
  state,
}: PolishModelActionProps) => {
  if (state === "not_downloaded") {
    return (
      <Button onClick={onDownload} size="sm" tone="primary" variant="solid">
        <DownloadSimpleIcon aria-hidden="true" className="mr-1 h-4 w-4" />
        Download
      </Button>
    );
  }
  if (state === "downloading") {
    return (
      <Button disabled={true} size="sm" tone="primary" variant="solid">
        <CircleNotchIcon
          aria-hidden="true"
          className="mr-1 h-4 w-4 animate-spin"
        />
        Downloading
      </Button>
    );
  }
  if (state === "repair") {
    return (
      <Button onClick={onRepair} size="sm" variant="surface">
        Repair
      </Button>
    );
  }
  return null;
};

interface PolishModelRowProps {
  onDelete: () => Promise<void>;
  onDownload: () => Promise<void>;
  onRepair: () => Promise<void>;
  progress?: number;
  status: PolishStatus;
}

export const PolishModelRow = ({
  onDelete,
  onDownload,
  onRepair,
  progress,
  status,
}: PolishModelRowProps) => {
  const footprint = usePolishModelFootprint();
  return (
    <ModelRow
      action={
        <PolishModelAction
          onDownload={onDownload}
          onRepair={onRepair}
          state={status.state}
        />
      }
      description={MODEL_USES}
      download={
        status.state === "downloading" && progress !== undefined
          ? { percentage: progress }
          : undefined
      }
      files={
        status.state === "ready"
          ? { disabled: false, modelId: polishModelId, onDelete }
          : undefined
      }
      footprint={footprint}
      name={polishModelName}
      status={rowStatus(status)}
    />
  );
};
