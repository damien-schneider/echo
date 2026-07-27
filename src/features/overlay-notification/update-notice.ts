import type {
  ActivityDecoration,
  ActivityVisualState,
} from "@/features/overlay-controls/recording-overlay-state";
import {
  type UpdateSnapshot,
  updateActionLabel,
  updateStatusText,
} from "@/features/updates/update-status";

export interface UpdateNotice {
  actionLabel: string | null;
  decoration: ActivityDecoration;
  isDismissible: boolean;
  text: string;
  visualState: ActivityVisualState;
}

interface UpdateNoticeOptions {
  dismissedVersion: string | null;
  snapshot: UpdateSnapshot;
}

const isRunning = (phase: UpdateSnapshot["phase"]) =>
  phase === "downloading" || phase === "installing";

/// A user-started check answers in its own window; the notch only mentions an installable version.
const hasNothingToOffer = ({
  dismissedVersion,
  snapshot,
}: UpdateNoticeOptions) => {
  if (snapshot.phase === "idle" || snapshot.phase === "checking") {
    return true;
  }
  if (snapshot.version === null) {
    return true;
  }
  return !isRunning(snapshot.phase) && snapshot.version === dismissedVersion;
};

const visualStateFor = (
  snapshot: UpdateSnapshot,
  running: boolean
): ActivityVisualState => {
  if (snapshot.phase === "error") {
    return "error";
  }
  return running ? "processing" : "steady";
};

export const updateNoticeFor = (
  options: UpdateNoticeOptions
): UpdateNotice | null => {
  if (hasNothingToOffer(options)) {
    return null;
  }
  const { snapshot } = options;
  const running = isRunning(snapshot.phase);
  return {
    actionLabel: updateActionLabel(snapshot),
    decoration: running ? "progress" : "none",
    isDismissible: !running,
    text: updateStatusText(snapshot),
    visualState: visualStateFor(snapshot, running),
  };
};
