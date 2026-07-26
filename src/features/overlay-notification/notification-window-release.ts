import type { NotificationMode } from "@/features/overlay-controls/recording-overlay-state";

/// Long enough to outlast the island morph and its exit animation, so the
/// backstop only ever fires on a surface that truly stopped arriving.
export const NOTIFICATION_RELEASE_DELAY_MS = 1200;

interface NotificationWindowEmptinessOptions {
  hasSurface: boolean;
  isPreparing: boolean;
  mode: NotificationMode | null;
}

/// Rust shows the native window before React has anything to draw into it. When
/// the surface never lands or the mode is dropped without an exit animation,
/// nothing unmounts and the empty frame would stay on screen — this is what
/// folds it back into the notch.
export const notificationWindowIsEmpty = ({
  hasSurface,
  isPreparing,
  mode,
}: NotificationWindowEmptinessOptions) =>
  !isPreparing && (mode === null || !hasSurface);
