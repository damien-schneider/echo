import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  parseUpdateSnapshot,
  type UpdateSnapshot,
  UpdateSnapshotSchema,
} from "@/features/updates/update-status";

const UPDATE_STATUS_EVENT = "update-status";

const UPDATE_COMMAND = {
  check: "check_for_updates",
  install: "install_update",
  read: "get_update_status",
} as const;

export const subscribeUpdateStatus = (
  onChange: (snapshot: UpdateSnapshot) => void
): Promise<UnlistenFn> =>
  listen<unknown>(UPDATE_STATUS_EVENT, (event) => {
    onChange(parseUpdateSnapshot(event.payload));
  });

/// Throws on an unreachable updater — nobody asked for this read, so the caller stays quiet.
export const readUpdateStatus = async (): Promise<UpdateSnapshot> =>
  UpdateSnapshotSchema.parse(await invoke<unknown>(UPDATE_COMMAND.read));

/// Resolves after the backend looked, so the caller can tell "up to date" from "never checked".
export const requestUpdateCheck = async (
  previous: UpdateSnapshot
): Promise<UpdateSnapshot> =>
  parseUpdateSnapshot(await invoke<unknown>(UPDATE_COMMAND.check), previous);

/// Resolves when the install fails; a successful one restarts the app instead.
export const requestUpdateInstall = (): Promise<void> =>
  invoke(UPDATE_COMMAND.install);
