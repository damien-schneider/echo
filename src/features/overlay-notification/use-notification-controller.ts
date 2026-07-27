import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNativeOverlayTransition } from "@/features/overlay-controls/motion/use-native-overlay-transition";
import {
  type ActivityAction,
  type OverlayEscapeIntent,
  overlayContentKey,
} from "@/features/overlay-controls/recording-overlay-state";
import {
  NOTIFICATION_HIDE_COMMAND,
  NOTIFICATION_REQUEST_EVENT,
  NOTIFICATION_WINDOW,
  type NotificationRequest,
  NotificationRequestSchema,
} from "@/features/overlay-controls/runtime/overlay-windows";
import { useOverlayEvents } from "@/features/overlay-controls/use-overlay-events";
import { createNotificationPresentation } from "@/features/overlay-notification/notification-presentation";
import { updateNoticeFor } from "@/features/overlay-notification/update-notice";
import { usePolishModel } from "@/features/polish/use-polish-model";
import { useUpdateStatus } from "@/features/updates/use-update-status";
import {
  initialModelState,
  type ModelState,
  subscribeModelState,
} from "@/lib/model-state";
import { listenCancellable } from "@/lib/tauri-listener";
import { overlayControlCommand } from "@/overlay/overlay-controls";

const ESCAPE_SHORTCUT_COMMAND = {
  register: "register_escape_shortcut",
  unregister: "unregister_escape_shortcut",
} as const;

const useModelState = (): ModelState => {
  const [state, setState] = useState<ModelState>(initialModelState);
  useEffect(() => listenCancellable(() => subscribeModelState(setState)), []);
  return state;
};

const useEscapeShortcut = (capturesEscape: boolean) => {
  useEffect(() => {
    const command = capturesEscape
      ? ESCAPE_SHORTCUT_COMMAND.register
      : ESCAPE_SHORTCUT_COMMAND.unregister;
    invoke(command).catch(() => undefined);
    return () => {
      invoke(ESCAPE_SHORTCUT_COMMAND.unregister).catch(() => undefined);
    };
  }, [capturesEscape]);
};

/// Opened from the HUD one window away, dropped as soon as activity needs the surface.
const useNotificationRequest = () => {
  const [request, setRequest] = useState<NotificationRequest | null>(null);
  useEffect(
    () =>
      listenCancellable(() =>
        listen<unknown>(NOTIFICATION_REQUEST_EVENT, (event) => {
          const parsed = NotificationRequestSchema.safeParse(event.payload);
          if (parsed.success) {
            setRequest(parsed.data);
          }
        })
      ),
    []
  );
  return { clearRequest: () => setRequest(null), request };
};

const useClearRequestOnActiveOperation = (
  hasActiveOperation: boolean,
  clearRequest: () => void
) => {
  useEffect(() => {
    if (hasActiveOperation) {
      clearRequest();
    }
  }, [clearRequest, hasActiveOperation]);
};

const useFollowStreamingText = (
  text: string,
  textScrollRef: RefObject<HTMLOutputElement | null>
) => {
  useEffect(() => {
    if (!(text && textScrollRef.current)) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const output = textScrollRef.current;
      if (output) {
        output.scrollLeft = output.scrollWidth;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [text, textScrollRef]);
};

const UPDATE_NOTICE_LINGER_MS = 15_000;

/// A notification, not a banner — the offer steps aside so the HUD handle comes back.
const useUpdateNotice = () => {
  const update = useUpdateStatus();
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const version = update.snapshot.version;
  const notice = updateNoticeFor({
    dismissedVersion,
    snapshot: update.snapshot,
  });
  // a download in flight keeps the surface; only a dismissible notice steps aside
  const isLingering = version !== null && (notice?.isDismissible ?? false);

  useEffect(() => {
    if (!isLingering) {
      return;
    }
    const timer = setTimeout(
      () => setDismissedVersion(version),
      UPDATE_NOTICE_LINGER_MS
    );
    return () => clearTimeout(timer);
  }, [isLingering, version]);

  return {
    dismiss: () => setDismissedVersion(version),
    install: update.install,
    notice,
  };
};

const dismissFromKeyboard = (
  event: KeyboardEvent<HTMLDivElement>,
  intent: OverlayEscapeIntent,
  dismissSurface: () => void
) => {
  if (event.key !== "Escape" || intent !== "dismiss_surface") {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  dismissSurface();
};

export const useNotificationController = () => {
  const microphoneRef = useRef<HTMLSpanElement>(null);
  const textScrollRef = useRef<HTMLOutputElement>(null);
  const events = useOverlayEvents(microphoneRef);
  const polish = usePolishModel();
  const modelState = useModelState();
  const { clearRequest, request } = useNotificationRequest();
  const update = useUpdateNotice();
  const presentation = createNotificationPresentation({
    events,
    modelState,
    request,
    updateNotice: update.notice,
  });
  const transition = useNativeOverlayTransition({
    channel: NOTIFICATION_WINDOW,
    initialMode: "recording",
    mode: presentation.mode,
  });
  const renderMode = presentation.mode === null ? null : transition.staged.mode;

  useClearRequestOnActiveOperation(
    presentation.hasActiveOperation,
    clearRequest
  );
  useEscapeShortcut(presentation.escapeIntent === "cancel_operation");
  useFollowStreamingText(events.streamingText, textScrollRef);

  /// Takes back only what the HUD asked for — passive activity behind it resurfaces.
  const dismissSurface = () => {
    transition.dismissError();
    if (request !== null) {
      clearRequest();
      return;
    }
    events.dismissPassiveActivity();
  };

  return {
    contentKey: overlayContentKey({
      mode: renderMode ?? "recording",
      overlayState: events.state,
      polishState: polish.status.state,
    }),
    dismissActivity: () => {
      const intent = presentation.activityDismissal?.intent;
      if (intent === "cancel_operation") {
        invoke("cancel_operation").catch(() => undefined);
        return;
      }
      if (intent === "dismiss_update") {
        update.dismiss();
        return;
      }
      dismissSurface();
    },
    dismissSurface,
    events,
    finishMorph: () => transition.settle(transition.staged.generation),
    handleKeyDown: (event: KeyboardEvent<HTMLDivElement>) =>
      dismissFromKeyboard(event, presentation.escapeIntent, dismissSurface),
    microphoneRef,
    polish,
    presentation,
    releaseWindow: () => {
      invoke(NOTIFICATION_HIDE_COMMAND).catch(() => undefined);
    },
    renderMode,
    /// Stop-recording and install-update share the activity bar's single button.
    runActivityAction: (intent: ActivityAction["intent"]) => {
      if (intent === "install_update") {
        update.install();
        return;
      }
      invoke(overlayControlCommand("stop_recording")).catch(() => undefined);
    },
    textScrollRef,
    transitionError: transition.error,
    transitionPhase: transition.phase,
  };
};

export type NotificationController = ReturnType<
  typeof useNotificationController
>;
