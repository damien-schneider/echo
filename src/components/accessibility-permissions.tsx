import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import {
  checkAccessibilityPermission,
  requestAccessibilityPermission,
} from "tauri-plugin-macos-permissions-api";
import { z } from "zod";
import { Button } from "@/components/ui/button";

const CHECK_INTERVAL_MS = 500;
const TRANSIENT_FAILURE_LIMIT = 2;
const PermissionResultSchema = z.boolean();

type PermissionState =
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

const checkPermission = async ({
  deniedState,
  setState,
  tracker,
}: PermissionCheckOptions) => {
  tracker.requestId += 1;
  const requestId = tracker.requestId;
  try {
    const result = PermissionResultSchema.safeParse(
      await checkAccessibilityPermission()
    );
    if (!result.success) {
      throw new Error("Invalid Accessibility permission response");
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
  state: PermissionState,
  setState: PermissionStateSetter,
  tracker: PermissionCheckTrackerRef
) => {
  const refresh = useEffectEvent((deniedState: "denied" | "verifying") => {
    checkPermission({ deniedState, setState, tracker: tracker.current });
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
  setState: PermissionStateSetter,
  tracker: PermissionCheckTracker
) => {
  setState("requesting");
  tracker.failureCount = 0;
  try {
    await requestAccessibilityPermission();
    setState((current) => (current === "granted" ? current : "verifying"));
    await checkPermission({ deniedState: "verifying", setState, tracker });
  } catch {
    setState((current) => (current === "granted" ? current : "request_error"));
  }
};

const runPermissionAction = async (
  state: PermissionState,
  setState: PermissionStateSetter,
  tracker: PermissionCheckTracker
) => {
  if (state === "check_error" || state === "verifying") {
    await checkPermission({
      deniedState: state === "verifying" ? "verifying" : "denied",
      setState,
      tracker,
    });
    return;
  }
  if (state === "denied" || state === "request_error") {
    await requestPermission(setState, tracker);
  }
};

const usePermissionLifecycle = () => {
  const [state, setState] = useState<PermissionState>("checking");
  const tracker = useRef<PermissionCheckTracker>({
    failureCount: 0,
    requestId: 0,
  });
  usePermissionRefresh(state, setState, tracker);
  const act = () => runPermissionAction(state, setState, tracker.current);
  return { act, state };
};

interface PermissionCopy {
  button: string;
  description: string;
  title: string;
}

const permissionCopy: Record<
  Exclude<PermissionState, "granted">,
  PermissionCopy
> = {
  check_error: {
    button: "Try again",
    description:
      "Echo could not confirm access. Check that this exact build is enabled, then retry.",
    title: "Couldn’t check Accessibility access",
  },
  checking: {
    button: "Checking…",
    description: "Confirming access for the Echo build currently running.",
    title: "Checking Accessibility access",
  },
  denied: {
    button: "Request Accessibility Access",
    description:
      "Enable the exact Echo build currently running. If a development entry is already enabled, remove it and add the rebuilt executable again.",
    title: "Accessibility access is not active for this build",
  },
  request_error: {
    button: "Try again",
    description:
      "Open Privacy & Security > Accessibility and enable this exact Echo build, then retry.",
    title: "Couldn’t request Accessibility access",
  },
  requesting: {
    button: "Requesting…",
    description: "Asking macOS to authorize the Echo build currently running.",
    title: "Requesting Accessibility access",
  },
  verifying: {
    button: "Check again",
    description:
      "Enable this exact Echo build in Settings. If it is already enabled, toggle it off and on or add it again. Echo will detect the change automatically.",
    title: "Waiting for Accessibility access",
  },
};

interface PermissionCardProps {
  onAction: () => Promise<void>;
  state: Exclude<PermissionState, "granted">;
}

const PermissionCard = ({ onAction, state }: PermissionCardProps) => {
  const copy = permissionCopy[state];
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
      <Button disabled={isBusy} onClick={onAction} size="sm" type="button">
        {copy.button}
      </Button>
    </section>
  );
};

export const AccessibilityPermissions = () => {
  const permission = usePermissionLifecycle();
  if (permission.state === "granted") {
    return null;
  }
  return <PermissionCard onAction={permission.act} state={permission.state} />;
};
