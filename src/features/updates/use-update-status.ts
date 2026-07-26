import { useEffect, useState } from "react";
import {
  readUpdateStatus,
  requestUpdateCheck,
  requestUpdateInstall,
  subscribeUpdateStatus,
} from "@/features/updates/update-bridge";
import {
  idleUpdateSnapshot,
  type UpdateSnapshot,
  updateBridgeFailure,
} from "@/features/updates/update-status";
import { listenCancellable } from "@/lib/tauri-listener";

/// The backend owns the state; a window that boots mid-download reads it once
/// and follows the event stream from there.
const useUpdateSubscription = (
  setSnapshot: (snapshot: UpdateSnapshot) => void
) => {
  useEffect(
    () =>
      listenCancellable(async () => {
        let published = false;
        const unlisten = await subscribeUpdateStatus((snapshot) => {
          published = true;
          setSnapshot(snapshot);
        });
        try {
          const initial = await readUpdateStatus();
          if (!published) {
            setSnapshot(initial);
          }
        } catch (error) {
          // Nobody asked for anything yet, so a silent updater stays silent.
          console.warn("Update status is unavailable:", error);
        }
        return unlisten;
      }),
    [setSnapshot]
  );
};

export const useUpdateStatus = () => {
  const [snapshot, setSnapshot] = useState(idleUpdateSnapshot);
  useUpdateSubscription(setSnapshot);

  const check = async () => {
    try {
      const next = await requestUpdateCheck(snapshot);
      setSnapshot(next);
      return next;
    } catch {
      const failure = updateBridgeFailure(snapshot);
      setSnapshot(failure);
      return failure;
    }
  };

  const install = async () => {
    try {
      await requestUpdateInstall();
    } catch {
      // The backend already published why it failed; only a dead bridge is news.
      setSnapshot((current) =>
        current.phase === "error" ? current : updateBridgeFailure(current)
      );
    }
  };

  return { check, install, snapshot };
};
