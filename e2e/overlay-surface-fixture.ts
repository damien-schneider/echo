// Mirrors src-tauri/src/overlay/surface.rs so the harness answers the same
// geometry contract the native side publishes.
export const setupOverlaySurface = () => {
  const state = window.__ECHO_TEST_STATE__;
  const INSET = 4;
  const params = new URLSearchParams(window.location.search);
  const placement = params.get("overlayPlacement");
  state.overlayAnchor = "right";
  state.overlayPresentation = "docked";
  if (placement === "bottom" || placement === "top") {
    state.overlayAnchor = placement;
    state.overlayPresentation = "bar";
  }
  state.overlayHidden = placement === "none";
  state.overlayMode = "compact";
  state.overlayNotch = null;

  const isResident = (mode: string) => mode === "compact" || mode === "actions";

  // Transient surfaces are pinned to the notch bar, like overlay_placement_for_mode.
  const anchorFor = (mode: string) =>
    isResident(mode) ? state.overlayAnchor : "top";
  const presentationFor = (mode: string) =>
    isResident(mode) ? state.overlayPresentation : "bar";

  const isSideDocked = (mode: string) =>
    presentationFor(mode) === "docked" &&
    (anchorFor(mode) === "left" || anchorFor(mode) === "right");

  const residentSize = (mode: string) => {
    if (isSideDocked(mode)) {
      return { height: 104, width: 32 };
    }
    return mode === "compact"
      ? { height: 5, width: 38 }
      : { height: 40, width: 128 };
  };

  const notchInset = (mode: string) =>
    state.overlayNotch && anchorFor(mode) === "top"
      ? state.overlayNotch.topInset
      : 0;

  const contentBox = (mode: string) => {
    const docked = presentationFor(mode) === "docked";
    const edge = (anchor: string) =>
      docked && anchorFor(mode) === anchor ? 0 : INSET;
    const top = edge("top") + notchInset(mode);
    return {
      height: window.innerHeight - top - edge("bottom"),
      width: window.innerWidth - edge("left") - edge("right"),
      x: edge("left"),
      y: top,
    };
  };

  const alignedIsland = (
    mode: string,
    size: { height: number; width: number }
  ) => {
    const box = contentBox(mode);
    const anchor = anchorFor(mode);
    const centeredX = box.x + (box.width - size.width) / 2;
    const centeredY = box.y + (box.height - size.height) / 2;
    if (anchor === "top") {
      return { ...size, x: centeredX, y: box.y };
    }
    if (anchor === "bottom") {
      return { ...size, x: centeredX, y: box.y + box.height - size.height };
    }
    if (anchor === "left") {
      return { ...size, x: box.x, y: centeredY };
    }
    return { ...size, x: box.x + box.width - size.width, y: centeredY };
  };

  const islandFor = (mode: string) => {
    if (isResident(mode)) {
      return alignedIsland(mode, residentSize(mode));
    }
    const box = contentBox(mode);
    return { height: box.height, width: box.width, x: box.x, y: box.y };
  };

  const notchBox = () => {
    const notch = state.overlayNotch;
    if (!notch) {
      return null;
    }
    return {
      height: notch.topInset,
      width: notch.width,
      x: window.innerWidth / 2 + notch.centerOffset - notch.width / 2,
    };
  };

  state.buildOverlaySurface = (mode: string) => {
    if (state.overlayHidden) {
      return null;
    }
    return {
      anchor: anchorFor(mode),
      island: islandFor(mode),
      notch: notchBox(),
      presentation: presentationFor(mode),
      window: { x: 0, y: 0 },
    };
  };

  // Each window owns a channel, exactly like the native side: the HUD never
  // hears about the geometry of a notification and the other way round.
  state.surfaceEventFor = (mode: string) =>
    isResident(mode) ? "overlay-surface" : "overlay-notification-surface";

  state.emitOverlaySurface = (mode: string) => {
    state.overlayMode = mode;
    const surface = state.buildOverlaySurface(mode);
    const event = state.surfaceEventFor(mode);
    for (const callback of state.eventListeners.get(event)?.values() ?? []) {
      callback({ event, id: 0, payload: surface });
    }
  };
};
