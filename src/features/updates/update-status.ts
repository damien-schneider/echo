import { z } from "zod";

/// Mirrors the Rust `UpdateSnapshot` — one owner publishes, every window renders.
export const UpdatePhaseSchema = z.enum([
  "available",
  "checking",
  "downloading",
  "error",
  "idle",
  "installing",
  "unsupported",
]);

export type UpdatePhase = z.infer<typeof UpdatePhaseSchema>;

export const UpdateSnapshotSchema = z.object({
  error: z.string().nullable(),
  phase: UpdatePhaseSchema,
  progress: z.number().int().min(0).max(100).nullable(),
  version: z.string().nullable(),
});

export type UpdateSnapshot = z.infer<typeof UpdateSnapshotSchema>;

export const idleUpdateSnapshot: UpdateSnapshot = {
  error: null,
  phase: "idle",
  progress: null,
  version: null,
};

const BRIDGE_FAILURE_MESSAGE =
  "Echo could not reach its updater. Reopen Echo and try again.";

/// A broken command or unreadable payload is a local failure, not something the backend published.
export const updateBridgeFailure = (
  previous: UpdateSnapshot = idleUpdateSnapshot
): UpdateSnapshot => ({
  error: BRIDGE_FAILURE_MESSAGE,
  phase: "error",
  progress: null,
  version: previous.version,
});

export const parseUpdateSnapshot = (
  payload: unknown,
  previous: UpdateSnapshot = idleUpdateSnapshot
): UpdateSnapshot => {
  const parsed = UpdateSnapshotSchema.safeParse(payload);
  return parsed.success ? parsed.data : updateBridgeFailure(previous);
};

export const isUpdateBusy = (phase: UpdatePhase) =>
  phase === "checking" || phase === "downloading" || phase === "installing";

export const canInstallUpdate = (snapshot: UpdateSnapshot) => {
  if (snapshot.phase === "available") {
    return true;
  }
  return snapshot.phase === "error" && snapshot.version !== null;
};

const downloadText = (progress: number | null) =>
  progress === null
    ? "Downloading update…"
    : `Downloading update… ${progress}%`;

export const updateStatusText = ({
  error,
  phase,
  progress,
  version,
}: UpdateSnapshot): string => {
  switch (phase) {
    case "checking":
      return "Checking for updates…";
    case "available":
      return version === null
        ? "Update available"
        : `Update available — v${version}`;
    case "downloading":
      return downloadText(progress);
    case "installing":
      return "Installing update…";
    case "error":
      return error ?? "The update failed.";
    default:
      return "";
  }
};

export const updateActionLabel = (snapshot: UpdateSnapshot): string | null => {
  if (snapshot.phase === "available") {
    return "Update";
  }
  return canInstallUpdate(snapshot) ? "Retry" : null;
};
