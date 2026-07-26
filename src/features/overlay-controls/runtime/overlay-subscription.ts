import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import {
  overlayEventFailureMessage,
  subscribeEventListeners,
} from "@/features/overlay-controls/runtime/event-subscription";
import type { OverlayActivityEvent } from "@/features/overlay-controls/runtime/overlay-activity-state";
import {
  type OverlaySurface,
  OverlaySurfaceSchema,
} from "@/features/overlay-controls/runtime/overlay-surface";
import type { OverlayWindowChannel } from "@/features/overlay-controls/runtime/overlay-windows";

export interface OverlaySurfaceState {
  isReady: boolean;
  surface: OverlaySurface | null;
}

export const initialSurfaceState: OverlaySurfaceState = {
  isReady: false,
  surface: null,
};

const fetchOverlaySurface = async (
  command: string
): Promise<OverlaySurface | null> => {
  const payload = await invoke<unknown>(command);
  return OverlaySurfaceSchema.parse(payload);
};

type SurfacePublisher = (surface: OverlaySurface | null) => void;

interface SubscriptionPorts {
  channel: OverlayWindowChannel;
  dispatch: (event: OverlayActivityEvent) => void;
  onFallback: () => OverlaySurface | null;
  registrations: (
    onSurface: SurfacePublisher
  ) => Array<() => Promise<UnlistenFn>>;
  setSurface: (state: OverlaySurfaceState) => void;
}

/// The first geometry comes from a command because the window may already be
/// placed when the webview boots; every later one arrives on the event channel.
export const startOverlaySubscription = (ports: SubscriptionPorts) => {
  let cleanup: UnlistenFn = () => undefined;
  let stopped = false;
  const isCancelled = () => stopped;
  const publish = (surface: OverlaySurface | null) => {
    if (!stopped) {
      ports.setSurface({ isReady: true, surface });
    }
  };
  subscribeEventListeners({
    afterSubscribe: async () => {
      const surface = await fetchOverlaySurface(
        ports.channel.surfaceCommand
      ).catch(ports.onFallback);
      if (!isCancelled()) {
        publish(surface);
      }
    },
    isCancelled,
    registrations: ports.registrations(publish),
  })
    .then((nextCleanup) => {
      cleanup = nextCleanup;
    })
    .catch(() => {
      if (stopped) {
        return;
      }
      ports.dispatch({ message: overlayEventFailureMessage, type: "failed" });
      publish(ports.onFallback());
    });
  return () => {
    stopped = true;
    cleanup();
  };
};
