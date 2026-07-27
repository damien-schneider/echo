import type { NotificationMode } from "@/features/overlay-controls/recording-overlay-state";

/// Outlasts the morph and its exit animation, so the backstop only fires on a surface that never arrived.
export const NOTIFICATION_RELEASE_DELAY_MS = 1200;

interface NotificationWindowEmptinessOptions {
  hasSurface: boolean;
  isPreparing: boolean;
  mode: NotificationMode | null;
}

/// Rust shows the native window before React can draw — without this the empty frame would stay on screen.
export const notificationWindowIsEmpty = ({
  hasSurface,
  isPreparing,
  mode,
}: NotificationWindowEmptinessOptions) =>
  !isPreparing && (mode === null || !hasSurface);
