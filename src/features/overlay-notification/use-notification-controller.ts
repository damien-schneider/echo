import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { requestAccessibilityPermission } from "tauri-plugin-macos-permissions-api";
import { z } from "zod";
import { useNativeOverlayTransition } from "@/features/overlay-controls/motion/use-native-overlay-transition";
import {
  type ActivityAction,
  type OverlayEscapeIntent,
  overlayContentKey,
} from "@/features/overlay-controls/recording-overlay-state";
import {
  CHAT_CONTEXT_EVENT,
  CHAT_CONTEXT_STATE_COMMAND,
  CHAT_MODEL_SETTINGS_COMMAND,
  type ChatContextEvent,
  ChatContextEventSchema,
  HELD_TRANSCRIPT_COMMAND,
  NOTIFICATION_HIDE_COMMAND,
  NOTIFICATION_REQUEST_EVENT,
  NOTIFICATION_REQUEST_STATE_COMMAND,
  NOTIFICATION_WINDOW,
  type NotificationRequestEvent,
  NotificationRequestEventSchema,
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

const OVERLAY_KEY_COMMAND = {
  hold: "hold_overlay_key",
  release: "release_overlay_key",
} as const;

type OverlayKey = "cancel" | "finish";

/// Rust holds the text until the surface is dismissed, so the panel can always re-read what it is showing.
const useHeldTranscript = (isShown: boolean) => {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!isShown) {
      return;
    }
    let isStopped = false;
    invoke<unknown>(HELD_TRANSCRIPT_COMMAND.read)
      .then((payload) => {
        const held = z.string().safeParse(payload);
        if (!isStopped && held.success) {
          setText(held.data);
        }
      })
      .catch(() => undefined);
    return () => {
      isStopped = true;
    };
  }, [isShown]);
  return text;
};

const useModelState = (): ModelState => {
  const [state, setState] = useState<ModelState>(initialModelState);
  useEffect(() => listenCancellable(() => subscribeModelState(setState)), []);
  return state;
};

/// Borrowed from the focused app only while the overlay can act on the key, and handed straight back after.
const useOverlayKey = (key: OverlayKey, isHeld: boolean) => {
  useEffect(() => {
    const command = isHeld
      ? OVERLAY_KEY_COMMAND.hold
      : OVERLAY_KEY_COMMAND.release;
    invoke(command, { key }).catch(() => undefined);
    return () => {
      invoke(OVERLAY_KEY_COMMAND.release, { key }).catch(() => undefined);
    };
  }, [isHeld, key]);
};

const nextChatContext = (
  current: ChatContextEvent | null,
  next: ChatContextEvent
): ChatContextEvent => {
  if (current === null || next.generation > current.generation) {
    return next;
  }
  if (
    next.generation < current.generation ||
    (current.state !== "loading" && next.state === "loading")
  ) {
    return current;
  }
  return next;
};

const nextNotificationRequest = (
  current: NotificationRequestEvent | null,
  next: NotificationRequestEvent
) =>
  current === null || next.generation >= current.generation ? next : current;

const parsedNotificationRequest = (
  payload: unknown
): NotificationRequestEvent | null => {
  const parsed = NotificationRequestEventSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
};
const parsedChatContext = (payload: unknown): ChatContextEvent | null => {
  const parsed = ChatContextEventSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
};

const useNotificationRequest = () => {
  const [requestEvent, setRequestEvent] =
    useState<NotificationRequestEvent | null>(null);
  const [chatContext, setChatContext] = useState<ChatContextEvent | null>(null);
  useEffect(
    () =>
      listenCancellable(() =>
        listen<unknown>(NOTIFICATION_REQUEST_EVENT, (event) => {
          const request = parsedNotificationRequest(event.payload);
          if (request !== null) {
            setRequestEvent((current) =>
              nextNotificationRequest(current, request)
            );
          }
        })
      ),
    []
  );
  useEffect(() => {
    let isStopped = false;
    invoke<unknown>(NOTIFICATION_REQUEST_STATE_COMMAND)
      .then((payload) => {
        const request = parsedNotificationRequest(payload);
        if (!(isStopped || request === null)) {
          setRequestEvent((current) =>
            nextNotificationRequest(current, request)
          );
        }
      })
      .catch(() => undefined);
    return () => {
      isStopped = true;
    };
  }, []);
  useEffect(
    () =>
      listenCancellable(() =>
        listen<unknown>(CHAT_CONTEXT_EVENT, (event) => {
          const context = parsedChatContext(event.payload);
          if (context !== null) {
            setChatContext((current) => nextChatContext(current, context));
          }
        })
      ),
    []
  );
  useEffect(() => {
    let isStopped = false;
    invoke<unknown>(CHAT_CONTEXT_STATE_COMMAND)
      .then((payload) => {
        const context = parsedChatContext(payload);
        if (!(isStopped || context === null)) {
          setChatContext((current) => nextChatContext(current, context));
        }
      })
      .catch(() => undefined);
    return () => {
      isStopped = true;
    };
  }, []);
  return {
    chatContext,
    clearRequest: () => {
      setChatContext(null);
      setRequestEvent(null);
    },
    request: requestEvent?.surface ?? null,
  };
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
  const { chatContext, clearRequest, request } = useNotificationRequest();
  const update = useUpdateNotice();
  const heldTranscript = useHeldTranscript(request === "transcript");
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
  useOverlayKey("cancel", presentation.escapeIntent === "cancel_operation");
  useOverlayKey(
    "finish",
    presentation.activityAction?.intent === "finish_recording"
  );
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
    chatContext,
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
    copyHeldTranscript: async () => {
      await invoke(HELD_TRANSCRIPT_COMMAND.copy);
    },
    dismissSurface,
    events,
    finishMorph: () => transition.settle(transition.staged.generation),
    heldTranscript,
    handleKeyDown: (event: KeyboardEvent<HTMLDivElement>) =>
      dismissFromKeyboard(event, presentation.escapeIntent, dismissSurface),
    microphoneRef,
    openChatModelSettings: () => {
      invoke(CHAT_MODEL_SETTINGS_COMMAND)
        .then(() => dismissSurface())
        .catch(() => undefined);
    },
    /// The prompt returns at once; the context watch notices the grant and reads the selection then.
    requestAccessibilityAccess: async () => {
      await requestAccessibilityPermission();
    },
    polish,
    presentation,
    releaseWindow: () => {
      invoke(NOTIFICATION_HIDE_COMMAND).catch(() => undefined);
    },
    sendHeldTranscriptToChat: () => {
      invoke(HELD_TRANSCRIPT_COMMAND.send).catch(() => undefined);
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
