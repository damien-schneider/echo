import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";

const CHECK_INTERVAL_MS = 500;
const TRANSIENT_FAILURE_LIMIT = 2;
const PermissionResultSchema = z.boolean();

export type PermissionState =
  | "check_error"
  | "checking"
  | "denied"
  | "granted"
  | "request_error"
  | "requesting"
  | "verifying";

type PermissionStateSetter = Dispatch<SetStateAction<PermissionState>>;

interface PermissionCheckOptions {
  deniedState: "denied" | "verifying";
  setState: PermissionStateSetter;
  tracker: PermissionCheckTracker;
}

interface PermissionCheckTracker {
  failureCount: number;
  requestId: number;
}

interface PermissionCheckTrackerRef {
  current: PermissionCheckTracker;
}

export interface MacosPermission {
  check: () => Promise<boolean>;
  copy: Record<
    Exclude<PermissionState, "granted">,
    { button: string; description: string; title: string }
  >;
  label: string;
  request: () => Promise<unknown>;
}

const nextCheckedState = (
  current: PermissionState,
  granted: boolean,
  deniedState: PermissionCheckOptions["deniedState"]
): PermissionState => {
  if (granted) {
    return "granted";
  }
  if (current === "requesting") {
    return current;
  }
  return current === "verifying" ? "verifying" : deniedState;
};

const checkPermission = async (
  { deniedState, setState, tracker }: PermissionCheckOptions,
  permission: MacosPermission
) => {
  tracker.requestId += 1;
  const requestId = tracker.requestId;
  try {
    const result = PermissionResultSchema.safeParse(await permission.check());
    if (!result.success) {
      throw new Error(`Invalid ${permission.label} permission response`);
    }
    if (requestId !== tracker.requestId) {
      return;
    }
    tracker.failureCount = 0;
    setState((current) => nextCheckedState(current, result.data, deniedState));
  } catch {
    if (requestId !== tracker.requestId) {
      return;
    }
    tracker.failureCount += 1;
    setState((current) => {
      if (current === "granted" || current === "requesting") {
        return current;
      }
      if (
        current === "verifying" &&
        tracker.failureCount <= TRANSIENT_FAILURE_LIMIT
      ) {
        return current;
      }
      return "check_error";
    });
  }
};

const usePermissionRefresh = (
  permission: MacosPermission,
  state: PermissionState,
  setState: PermissionStateSetter,
  tracker: PermissionCheckTrackerRef
) => {
  const refresh = useEffectEvent((deniedState: "denied" | "verifying") => {
    checkPermission(
      { deniedState, setState, tracker: tracker.current },
      permission
    );
  });
  useEffect(() => {
    const handleFocus = () => refresh("denied");
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh("denied");
      }
    };
    refresh("denied");
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (state !== "verifying") {
      return;
    }
    const interval = window.setInterval(
      () => refresh("verifying"),
      CHECK_INTERVAL_MS
    );
    return () => window.clearInterval(interval);
  }, [state]);
};

const requestPermission = async (
  permission: MacosPermission,
  setState: PermissionStateSetter,
  tracker: PermissionCheckTracker
) => {
  setState("requesting");
  tracker.failureCount = 0;
  try {
    await permission.request();
    setState((current) => (current === "granted" ? current : "verifying"));
    await checkPermission(
      { deniedState: "verifying", setState, tracker },
      permission
    );
  } catch {
    setState((current) => (current === "granted" ? current : "request_error"));
  }
};

const runPermissionAction = async (
  permission: MacosPermission,
  state: PermissionState,
  setState: PermissionStateSetter,
  tracker: PermissionCheckTracker
) => {
  if (state === "check_error" || state === "verifying") {
    await checkPermission(
      {
        deniedState: state === "verifying" ? "verifying" : "denied",
        setState,
        tracker,
      },
      permission
    );
    return;
  }
  if (state === "denied" || state === "request_error") {
    await requestPermission(permission, setState, tracker);
  }
};

const usePermissionLifecycle = (permission: MacosPermission) => {
  const [state, setState] = useState<PermissionState>("checking");
  const tracker = useRef<PermissionCheckTracker>({
    failureCount: 0,
    requestId: 0,
  });
  const trackedPermission = useRef(permission);
  trackedPermission.current = permission;
  usePermissionRefresh(trackedPermission.current, state, setState, tracker);
  const act = () =>
    runPermissionAction(
      trackedPermission.current,
      state,
      setState,
      tracker.current
    );
  return { act, state };
};

export const PermissionGate = ({
  permission,
}: {
  permission: MacosPermission;
}) => {
  const { act, state } = usePermissionLifecycle(permission);
  if (state === "granted") {
    return null;
  }
  const copy = permission.copy[state];
  const isBusy = state === "checking" || state === "requesting";
  const isError = state === "check_error" || state === "request_error";
  return (
    <section
      aria-live="polite"
      className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-border p-4"
      role={isError ? "alert" : "status"}
    >
      <div className="min-w-0">
        <p className="font-medium text-sm">{copy.title}</p>
        <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
          {copy.description}
        </p>
      </div>
      <Button disabled={isBusy} onClick={act} size="sm" type="button">
        {copy.button}
      </Button>
    </section>
  );
};
