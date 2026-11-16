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
import { invokeOverlayControl } from "@/features/overlay-controls/runtime/control-invocation";
import {
  CHAT_CONTEXT_EVENT,
  CHAT_CONTEXT_STATE_COMMAND,
  type ChatContextEvent,
  ChatContextEventSchema,
  HELD_TRANSCRIPT_COMMAND,
  NOTIFICATION_HIDE_COMMAND,
  NOTIFICATION_REQUEST_EVENT,
  NOTIFICATION_REQUEST_STATE_COMMAND,
  NOTIFICATION_WINDOW,
  type NotificationRequestEvent,
  NotificationRequestEventSchema,
  OVERLAY_WARNING_COMMAND,
} from "@/features/overlay-controls/runtime/overlay-windows";
import { useOverlayEvents } from "@/features/overlay-controls/use-overlay-events";
import {
  closedChatSurface,
  heardChatContext,
  initialChatSurface,
} from "@/features/overlay-notification/chat-surface-state";
import { useMeetingNotice } from "@/features/overlay-notification/meeting-notice";
import { createNotificationPresentation } from "@/features/overlay-notification/notification-presentation";
import { updateNoticeFor } from "@/features/overlay-notification/update-notice";
import { useOverlayKey } from "@/features/overlay-notification/use-overlay-key";
import { usePolishModel } from "@/features/polish/use-polish-model";
import { useUpdateStatus } from "@/features/updates/use-update-status";
import {
  initialModelState,
  type ModelState,
  subscribeModelState,
} from "@/lib/model-state";
import { listenCancellable } from "@/lib/tauri-listener";

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

/// The newest request heard tells Rust whether a hide was sent before a later request reached this window.
const useRequestEvent = () => {
  const [requestEvent, setRequestEvent] =
    useState<NotificationRequestEvent | null>(null);
  const lastSeenGeneration = useRef(0);
  useEffect(() => {
    let isStopped = false;
    const hear = (payload: unknown) => {
      const request = parsedNotificationRequest(payload);
      if (isStopped || request === null) {
        return;
      }
      lastSeenGeneration.current = Math.max(
        lastSeenGeneration.current,
        request.generation
      );
      setRequestEvent((current) => nextNotificationRequest(current, request));
    };
    const stopListening = listenCancellable(() =>
      listen<unknown>(NOTIFICATION_REQUEST_EVENT, (event) =>
        hear(event.payload)
      )
    );
    invoke<unknown>(NOTIFICATION_REQUEST_STATE_COMMAND)
      .then(hear)
      .catch(() => undefined);
    return () => {
      isStopped = true;
      stopListening();
    };
  }, []);
  return { lastSeenGeneration, requestEvent, setRequestEvent };
};

const useNotificationRequest = () => {
  const { lastSeenGeneration, requestEvent, setRequestEvent } =
    useRequestEvent();
  const [chat, setChat] = useState(initialChatSurface);
  useEffect(
    () =>
      listenCancellable(() =>
        listen<unknown>(CHAT_CONTEXT_EVENT, (event) => {
          const context = parsedChatContext(event.payload);
          if (context !== null) {
            setChat((current) => heardChatContext(current, context));
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
          setChat((current) => heardChatContext(current, context));
        }
      })
      .catch(() => undefined);
    return () => {
      isStopped = true;
    };
  }, []);
  return {
    chatContext: chat.context,
    clearRequest: () => {
      setChat(closedChatSurface);
      setRequestEvent(null);
    },
    closedChatGeneration: chat.closedGeneration,
    lastSeenGeneration,
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

const finishRecording = async () => {
  const message = await invokeOverlayControl({
    action: "stop_recording",
    invokeCommand: (command) => invoke(command),
  });
  if (message !== null) {
    await invoke(OVERLAY_WARNING_COMMAND, { message });
  }
};

export const useNotificationController = () => {
  const microphoneRef = useRef<HTMLSpanElement>(null);
  const textScrollRef = useRef<HTMLOutputElement>(null);
  const events = useOverlayEvents(microphoneRef);
  const polish = usePolishModel();
  const modelState = useModelState();
  const {
    chatContext,
    clearRequest,
    closedChatGeneration,
    lastSeenGeneration,
    request,
  } = useNotificationRequest();
  const update = useUpdateNotice();
  const meeting = useMeetingNotice();
  const heldTranscript = useHeldTranscript(request === "transcript");
  const presentation = createNotificationPresentation({
    events,
    meetingNotice: meeting.notice,
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
    closedChatGeneration,
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
      if (intent === "dismiss_meeting") {
        meeting.dismiss();
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
    /// The prompt returns at once; the context watch notices the grant and reads the selection then.
    requestAccessibilityAccess: async () => {
      await requestAccessibilityPermission();
    },
    polish,
    presentation,
    releaseWindow: () => {
      invoke(NOTIFICATION_HIDE_COMMAND, {
        lastSeenRequest: lastSeenGeneration.current,
      }).catch(() => undefined);
    },
    sendHeldTranscriptToChat: () => invoke(HELD_TRANSCRIPT_COMMAND.send),
    renderMode,
    /// Whatever speaks through the island acts through its one button.
    runActivityAction: (intent: ActivityAction["intent"]) => {
      if (intent === "install_update") {
        update.install();
        return;
      }
      if (intent === "stop_meeting") {
        meeting.stop();
        return;
      }
      if (intent === "download_transcription_model") {
        invoke("download_configured_transcription_model").catch(
          () => undefined
        );
        return;
      }
      finishRecording().catch(() => undefined);
    },
    textScrollRef,
    transitionError: transition.error,
    transitionPhase: transition.phase,
  };
};

export type NotificationController = ReturnType<
  typeof useNotificationController
>;
