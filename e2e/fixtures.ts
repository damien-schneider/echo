import { setupOverlaySurface } from "@e2e/overlay-surface-fixture";
import { test as base, type Page } from "@playwright/test";

interface EchoInvocation {
  args: unknown;
  command: string;
}

interface EchoTestApi {
  commands: string[];
  deferNextAccessibilityChecks: (count: number) => void;
  deferNextOverlayModePreflights: (count: number) => void;
  emit: (event: string, payload: unknown) => void;
  failNextAccessibilityChecks: (count: number) => void;
  holdChatContextRefresh: () => void;
  invocations: EchoInvocation[];
  listenerCount: (event: string) => number;
  pendingAccessibilityCheckCount: () => number;
  pendingOverlayModePreflightCount: () => number;
  releaseChatContextRefresh: () => void;
  resolveAccessibilityCheck: (index: number, granted: boolean) => void;
  resolveOverlayModePreflight: (index: number) => void;
  resolveOverlaySurface: () => void;
  setAccessibilityPermission: (granted: boolean) => void;
  setOverlayAnchor: (anchor: string, presentation: string) => void;
  setOverlayNotch: (notch: OverlayNotchGeometry | null) => void;
  setPolishStatus: (state: string) => void;
}

export interface OverlayNotchGeometry {
  centerOffset: number;
  topInset: number;
  width: number;
}

export interface EchoTestState {
  accessibilityCheckFailuresRemaining: number;
  accessibilityCheckResolvers: Array<(granted: boolean) => void>;
  accessibilityChecksToDefer: number;
  accessibilityPermission: unknown;
  buildOverlaySurface: (mode: string) => unknown;
  callbacks: Map<number, (payload: unknown) => void>;
  chatContextRefreshResolvers: Array<() => void>;
  chatContextResponse: unknown;
  chatReply: string;
  commands: string[];
  emitOverlaySurface: (mode: string) => void;
  eventListeners: Map<string, Map<number, (payload: unknown) => void>>;
  holdsChatContextRefresh: boolean;
  invocations: EchoInvocation[];
  invokeDefaults: Record<string, unknown>;
  nextCallbackId: number;
  nextEventId: number;
  overlayAnchor: string;
  overlayHidden: boolean;
  overlayMode: string;
  overlayModePreflightResolvers: Array<() => void>;
  overlayModePreflightsToDefer: number;
  overlayNotch: OverlayNotchGeometry | null;
  overlayPresentation: string;
  overlaySurfaceDeferred: boolean;
  overlaySurfaceResolver: ((surface: unknown) => void) | null;
  polishStatus: string;
  registerEvent: (args: unknown) => number;
  respond: (command: string, args?: unknown) => unknown;
  surfaceEventFor: (mode: string) => string;
  unregisterEvent: (args: unknown) => null;
}

declare global {
  interface Window {
    __ECHO_TEST__: EchoTestApi;
    __ECHO_TEST_STATE__: EchoTestState;
  }
}

const setupEchoTestState = () => {
  const accessibility = new URLSearchParams(window.location.search).get(
    "accessibility"
  );
  const selectedContext = new URLSearchParams(window.location.search).get(
    "selectedContext"
  );
  let accessibilityPermission: boolean | string = false;
  if (accessibility === "granted") {
    accessibilityPermission = true;
  }
  if (accessibility === "invalid") {
    accessibilityPermission = "invalid";
  }
  window.__ECHO_TEST_STATE__ = {
    accessibilityCheckFailuresRemaining: 0,
    chatContextRefreshResolvers: [],
    chatReply:
      new URLSearchParams(window.location.search).get("chatReply") ??
      "Echo 4B reply",
    chatReplyResolvers: [],
    holdsChatContextRefresh: false,
    holdsChatReply: false,
    accessibilityCheckResolvers: [],
    accessibilityChecksToDefer: 0,
    accessibilityPermission,
    chatContextResponse: {
      context:
        selectedContext === null
          ? null
          : {
              source: "selection",
              text: selectedContext,
              truncated: false,
            },
      generation: 1,
      state: "ready",
    },
    buildOverlaySurface: () => null,
    callbacks: new Map(),
    emitOverlaySurface: () => undefined,
    commands: [],
    eventListeners: new Map(),
    invocations: [],
    invokeDefaults: {
      check_custom_sounds: { start: false, stop: false },
      get_available_microphones: [{ id: "default", name: "Default" }],
      get_available_output_devices: [{ id: "default", name: "Default" }],
      get_clamshell_microphone: "Default",
      get_held_transcript: "Ok, let's rerun alors.",
      get_microphone_mode: false,
      get_selected_microphone: "Default",
      get_selected_output_device: "Default",
      get_update_status: {
        error: null,
        phase: "idle",
        progress: null,
        version: null,
      },
      has_any_models_available: true,
    },
    nextCallbackId: 1,
    nextEventId: 1,
    overlayAnchor: "right",
    overlayHidden: false,
    overlayMode: "compact",
    overlayModePreflightResolvers: [],
    overlayModePreflightsToDefer: 0,
    overlayNotch: null,
    overlayPresentation: "docked",
    overlaySurfaceDeferred: new URLSearchParams(window.location.search).has(
      "deferPlacement"
    ),
    overlaySurfaceResolver: null,
    polishStatus:
      new URLSearchParams(window.location.search).get("polish") ??
      "not_downloaded",
    registerEvent: () => 0,
    respond: () => null,
    surfaceEventFor: () => "overlay-surface",
    unregisterEvent: () => null,
  };
};

const setupEventCommands = () => {
  const state = window.__ECHO_TEST_STATE__;
  state.registerEvent = (args) => {
    if (!(typeof args === "object" && args !== null)) {
      return 0;
    }
    if (!("event" in args && "handler" in args)) {
      return 0;
    }
    if (typeof args.event !== "string" || typeof args.handler !== "number") {
      return 0;
    }
    if (
      new URLSearchParams(window.location.search).get("rejectEvent") ===
      args.event
    ) {
      throw new Error(`Rejected listener ${args.event}`);
    }
    const callback = state.callbacks.get(args.handler);
    if (!callback) {
      return 0;
    }
    const eventId = state.nextEventId;
    state.nextEventId += 1;
    const listeners = state.eventListeners.get(args.event) ?? new Map();
    listeners.set(eventId, callback);
    state.eventListeners.set(args.event, listeners);
    return eventId;
  };
  state.unregisterEvent = (args) => {
    if (!(typeof args === "object" && args !== null)) {
      return null;
    }
    if (!("event" in args && "eventId" in args)) {
      return null;
    }
    if (typeof args.event !== "string" || typeof args.eventId !== "number") {
      return null;
    }
    const listeners = state.eventListeners.get(args.event);
    listeners?.delete(args.eventId);
    if (listeners?.size === 0) {
      state.eventListeners.delete(args.event);
    }
    return null;
  };
};

const setupCommandResponder = () => {
  const state = window.__ECHO_TEST_STATE__;
  let notificationRequest: {
    generation: number;
    surface: string;
  } | null = null;
  let notificationRequestGeneration = 0;
  const requestedMode = (args: unknown) =>
    typeof args === "object" && args !== null && "mode" in args
      ? String(args.mode)
      : state.overlayMode;
  // Both windows drive their own frame through the same preflight handshake.
  const prepareMode = (args: unknown) => {
    const mode = requestedMode(args);
    if (state.overlayModePreflightsToDefer > 0) {
      state.overlayModePreflightsToDefer -= 1;
      return new Promise<void>((resolve) => {
        state.overlayModePreflightResolvers.push(() => {
          state.emitOverlaySurface(mode);
          resolve();
        });
      });
    }
    state.emitOverlaySurface(mode);
    return null;
  };
  const exactResponses = new Map<string, (args?: unknown) => unknown>([
    [
      "plugin:macos-permissions|check_accessibility_permission",
      () => {
        if (state.accessibilityChecksToDefer > 0) {
          state.accessibilityChecksToDefer -= 1;
          return new Promise<boolean>((resolve) => {
            state.accessibilityCheckResolvers.push(resolve);
          });
        }
        if (state.accessibilityCheckFailuresRemaining > 0) {
          state.accessibilityCheckFailuresRemaining -= 1;
          throw new Error("Transient Accessibility check failure");
        }
        return state.accessibilityPermission;
      },
    ],
    ["plugin:macos-permissions|request_accessibility_permission", () => null],
    [
      "get_polish_status",
      () => ({ message: state.polishStatus, state: state.polishStatus }),
    ],
    [
      "chat_with_polish_model",
      () => {
        if (!state.holdsChatReply) {
          return state.chatReply;
        }
        return new Promise<unknown>((resolve) => {
          state.chatReplyResolvers.push(() => resolve(state.chatReply));
        });
      },
    ],
    [
      "refresh_overlay_chat_context",
      () => {
        if (!state.holdsChatContextRefresh) {
          return state.chatContextResponse;
        }
        return new Promise<unknown>((resolve) => {
          state.chatContextRefreshResolvers.push(() =>
            resolve(state.chatContextResponse)
          );
        });
      },
    ],
    ["get_overlay_chat_context", () => state.chatContextResponse],
    ["download_polish_model", () => new Promise(() => undefined)],
    ["repair_polish_model", () => new Promise(() => undefined)],
    ["plugin:store|get_store", () => 1],
    ["plugin:store|get", () => [null, false]],
    ["plugin:store|has", () => false],
    ["plugin:event|listen", state.registerEvent],
    ["plugin:event|unlisten", state.unregisterEvent],
    [
      "get_recording_overlay_surface",
      () => {
        if (state.overlaySurfaceDeferred) {
          return new Promise<unknown>((resolve) => {
            state.overlaySurfaceResolver = resolve;
          });
        }
        return state.buildOverlaySurface(state.overlayMode);
      },
    ],
    ["set_recording_overlay_mode", prepareMode],
    ["settle_recording_overlay_mode", () => null],
    [
      "get_overlay_notification_surface",
      () =>
        state.surfaceEventFor(state.overlayMode) === "overlay-surface"
          ? null
          : state.buildOverlaySurface(state.overlayMode),
    ],
    [
      "get_overlay_notification_request",
      () => {
        if (notificationRequest !== null) {
          return notificationRequest;
        }
        const surface = new URLSearchParams(window.location.search).get(
          "notificationRequest"
        );
        return surface === "chat" || surface === "panel"
          ? { generation: 1, surface }
          : null;
      },
    ],
    ["set_overlay_notification_mode", prepareMode],
    ["settle_overlay_notification_mode", () => null],
    [
      "hide_overlay_notification",
      () => {
        notificationRequest = null;
        return null;
      },
    ],
    [
      "request_overlay_notification",
      (args) => {
        const surface =
          typeof args === "object" && args !== null && "surface" in args
            ? String(args.surface)
            : "chat";
        notificationRequestGeneration += 1;
        notificationRequest = {
          generation: notificationRequestGeneration,
          surface,
        };
        for (const callback of state.eventListeners
          .get("overlay-notification-request")
          ?.values() ?? []) {
          callback({
            event: "overlay-notification-request",
            id: 0,
            payload: notificationRequest,
          });
        }
        return null;
      },
    ],
    ["warn_from_overlay", () => null],
  ]);
  state.respond = (command, args) => {
    state.commands.push(command);
    state.invocations.push({ args, command });
    if (new URLSearchParams(window.location.search).get("reject") === command) {
      throw new Error(`Rejected ${command}`);
    }
    const exactResponse = exactResponses.get(command);
    if (exactResponse) {
      return exactResponse(args);
    }
    return command in state.invokeDefaults
      ? state.invokeDefaults[command]
      : null;
  };
};

const setupEchoTestApi = () => {
  const state = window.__ECHO_TEST_STATE__;
  window.__ECHO_TEST__ = {
    commands: state.commands,
    invocations: state.invocations,
    deferNextAccessibilityChecks: (count) => {
      state.accessibilityChecksToDefer = count;
    },
    deferNextOverlayModePreflights: (count) => {
      state.overlayModePreflightsToDefer = count;
    },
    emit: (event, payload) => {
      if (event === "overlay-chat-context") {
        state.chatContextResponse = payload;
      }
      for (const callback of state.eventListeners.get(event)?.values() ?? []) {
        callback({ event, id: 0, payload });
      }
    },
    failNextAccessibilityChecks: (count) => {
      state.accessibilityCheckFailuresRemaining = count;
    },
    holdChatContextRefresh: () => {
      state.holdsChatContextRefresh = true;
    },
    holdChatReply: () => {
      state.holdsChatReply = true;
    },
    releaseChatReply: () => {
      state.holdsChatReply = false;
      for (const resolve of state.chatReplyResolvers.splice(0)) {
        resolve();
      }
    },
    releaseChatContextRefresh: () => {
      state.holdsChatContextRefresh = false;
      for (const resolve of state.chatContextRefreshResolvers.splice(0)) {
        resolve();
      }
    },
    listenerCount: (event) => state.eventListeners.get(event)?.size ?? 0,
    pendingAccessibilityCheckCount: () =>
      state.accessibilityCheckResolvers.length,
    pendingOverlayModePreflightCount: () =>
      state.overlayModePreflightResolvers.length,
    resolveAccessibilityCheck: (index, granted) => {
      const [resolve] = state.accessibilityCheckResolvers.splice(index, 1);
      resolve?.(granted);
    },
    resolveOverlayModePreflight: (index) => {
      const [resolve] = state.overlayModePreflightResolvers.splice(index, 1);
      resolve?.();
    },
    resolveOverlaySurface: () => {
      state.overlaySurfaceDeferred = false;
      state.overlaySurfaceResolver?.(
        state.buildOverlaySurface(state.overlayMode)
      );
      state.overlaySurfaceResolver = null;
    },
    setOverlayAnchor: (anchor, presentation) => {
      state.overlayAnchor = anchor;
      state.overlayPresentation = presentation;
      state.emitOverlaySurface(state.overlayMode);
    },
    setOverlayNotch: (notch) => {
      state.overlayNotch = notch;
      state.emitOverlaySurface(state.overlayMode);
    },
    setAccessibilityPermission: (granted) => {
      state.accessibilityPermission = granted;
    },
    setPolishStatus: (nextStatus) => {
      state.polishStatus = nextStatus;
    },
  };
};

const setupTauriInternals = () => {
  const state = window.__ECHO_TEST_STATE__;
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    value: {
      callbacks: state.callbacks,
      invoke: (command: string, args?: unknown) =>
        Promise.resolve(state.respond(command, args)),
      metadata: {
        currentWebview: { label: "recording_overlay" },
        currentWindow: { label: "recording_overlay" },
      },
      transformCallback: (callback?: (payload: unknown) => void) => {
        const id = state.nextCallbackId;
        state.nextCallbackId += 1;
        if (callback) {
          state.callbacks.set(id, callback);
        }
        return id;
      },
      unregisterCallback: (id: number) => state.callbacks.delete(id),
    },
    writable: false,
  });
};

const setupTauriPlugins = () => {
  Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
    value: { unregisterListener: () => undefined },
    writable: false,
  });
  Object.defineProperty(window, "__TAURI_OS_PLUGIN_INTERNALS__", {
    value: {
      arch: "aarch64",
      eol: "\n",
      exe_extension: "",
      family: "unix",
      os_type: "macos",
      platform: "macos",
      version: "14.0.0",
    },
    writable: false,
  });
};

const installTauriHarness = async (page: Page) => {
  const setupScripts = [
    setupEchoTestState,
    setupOverlaySurface,
    setupEventCommands,
    setupCommandResponder,
    setupEchoTestApi,
    setupTauriInternals,
    setupTauriPlugins,
  ];
  const content = setupScripts
    .map((setup) => `(${setup.toString()})();`)
    .join("\n");
  await page.addInitScript({ content });
};

export const test = base.extend({
  page: async ({ page }, use) => {
    await installTauriHarness(page);
    await use(page);
  },
});

/// The HUD and the notification are two windows, so they are two pages here.
export const HUD_URL = "/src/overlay/index.html";
export const NOTIFICATION_URL = "/src/overlay/notification.html";

export const emitTauriEvent = (page: Page, event: string, payload: unknown) =>
  page.evaluate(
    ({ eventName, eventPayload }) => {
      window.__ECHO_TEST__.emit(eventName, eventPayload);
    },
    { eventName: event, eventPayload: payload }
  );

export const requestNotificationSurface = (
  page: Page,
  surface: "chat" | "panel" | "transcript"
) =>
  emitTauriEvent(page, "overlay-notification-request", {
    generation: 1,
    surface,
  });

export const holdChatContextRefresh = (page: Page) =>
  page.evaluate(() => window.__ECHO_TEST__.holdChatContextRefresh());

export const releaseChatContextRefresh = (page: Page) =>
  page.evaluate(() => window.__ECHO_TEST__.releaseChatContextRefresh());

export const holdChatReply = (page: Page) =>
  page.evaluate(() => window.__ECHO_TEST__.holdChatReply());

export const releaseChatReply = (page: Page) =>
  page.evaluate(() => window.__ECHO_TEST__.releaseChatReply());

export const invokedCommands = (page: Page) =>
  page.evaluate(() => [...window.__ECHO_TEST__.commands]);

export const invokedCommandPayloads = (page: Page, command: string) =>
  page.evaluate(
    (requestedCommand) =>
      window.__ECHO_TEST__.invocations
        .filter((invocation) => invocation.command === requestedCommand)
        .map((invocation) => JSON.stringify(invocation.args) ?? ""),
    command
  );

export const deferNextOverlayModePreflights = (page: Page, count: number) =>
  page.evaluate(
    (nextCount) =>
      window.__ECHO_TEST__.deferNextOverlayModePreflights(nextCount),
    count
  );

export const resolveOverlayModePreflight = (page: Page, index: number) =>
  page.evaluate(
    (preflightIndex) =>
      window.__ECHO_TEST__.resolveOverlayModePreflight(preflightIndex),
    index
  );

export const waitForOverlayModePreflights = (page: Page, count: number) =>
  page.waitForFunction(
    (minimum) =>
      window.__ECHO_TEST__.pendingOverlayModePreflightCount() >= minimum,
    count
  );

export const setOverlayAnchor = (
  page: Page,
  anchor: string,
  presentation: string
) =>
  page.evaluate(
    ({ nextAnchor, nextPresentation }) =>
      window.__ECHO_TEST__.setOverlayAnchor(nextAnchor, nextPresentation),
    { nextAnchor: anchor, nextPresentation: presentation }
  );

export const setOverlayNotch = (
  page: Page,
  notch: OverlayNotchGeometry | null
) =>
  page.evaluate(
    (nextNotch) => window.__ECHO_TEST__.setOverlayNotch(nextNotch),
    notch
  );

export const resolveOverlaySurface = (page: Page) =>
  page.evaluate(() => window.__ECHO_TEST__.resolveOverlaySurface());

export const setAccessibilityPermission = (page: Page, granted: boolean) =>
  page.evaluate(
    (nextPermission) =>
      window.__ECHO_TEST__.setAccessibilityPermission(nextPermission),
    granted
  );

export const setTauriPolishStatus = (page: Page, state: string) =>
  page.evaluate(
    (nextState) => window.__ECHO_TEST__.setPolishStatus(nextState),
    state
  );

export const waitForTauriListener = async (
  page: Page,
  event: string,
  count = 1
) => {
  await page.waitForFunction(
    ({ eventName, minimum }) =>
      window.__ECHO_TEST__.listenerCount(eventName) >= minimum,
    { eventName: event, minimum: count }
  );
  await page.waitForTimeout(50);
  await page.waitForFunction(
    ({ eventName, minimum }) =>
      window.__ECHO_TEST__.listenerCount(eventName) >= minimum,
    { eventName: event, minimum: count }
  );
};
