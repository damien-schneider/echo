import {
  AnimatePresence,
  m,
  useIsPresent,
  useReducedMotion,
} from "motion/react";
import {
  type CSSProperties,
  type ReactNode,
  type Ref,
  useEffect,
  useEffectEvent,
} from "react";
import {
  dockShoulder,
  dockSilhouettePath,
} from "@/features/overlay-controls/motion/dock-silhouette";
import {
  bridgeBandOf,
  islandCornerRadii,
  PILL_RADIUS,
} from "@/features/overlay-controls/motion/island-corners";
import { useMeasuredIslandSize } from "@/features/overlay-controls/motion/island-measurement";
import type { IslandEntry } from "@/features/overlay-controls/motion/notch-entry";
import { useIslandLanding } from "@/features/overlay-controls/motion/use-island-landing";
import {
  hasDockGearSlot,
  isSideDockedSurface,
} from "@/features/overlay-controls/overlay-presentation";
import type { OverlayMode } from "@/features/overlay-controls/recording-overlay-state";
import {
  bridgeToNotch,
  type IslandSize,
  islandFrame,
  type OverlayAnchor,
  type OverlayBox,
  type OverlaySurface,
  spanTheNotch,
  toScreenBox,
} from "@/features/overlay-controls/runtime/overlay-surface";
import "@/features/overlay-controls/motion/island-morph.css";

const DRAG_LIFT_SCALE = 0.985;

// opacity and blur ride a curve, not a spring: an overshoot there flickers
const ISLAND_CONTENT_FADE = {
  duration: 0.2,
  ease: [0.22, 1, 0.36, 1],
} as const;

const ISLAND_CONTENT_MOTION = {
  animate: { filter: "blur(0px)", opacity: 1 },
  exit: {
    filter: "blur(3px)",
    opacity: 0,
    transition: { duration: 0.13, ease: [0.4, 0, 1, 1] },
  },
  initial: { filter: "blur(4px)", opacity: 0 },
} as const;

/// Rust pastes ~50 ms after the hide and holds the main thread that commits these frames; the shell waits it out.
const PASTE_STALL_SECONDS = 0.1;

const ISLAND_COLLAPSE = {
  delay: PASTE_STALL_SECONDS,
  duration: 0.5,
  ease: [0.645, 0.045, 0.355, 1],
} as const;

const ISLAND_FADE_OUT = {
  opacity: 0,
  transition: ISLAND_CONTENT_FADE,
} as const;

const islandExit = (entry: IslandEntry, reduceMotion: boolean): IslandEntry =>
  reduceMotion ? ISLAND_FADE_OUT : { ...entry, transition: ISLAND_COLLAPSE };

const isResidentMode = (mode: OverlayMode) =>
  mode === "compact" || mode === "actions";

interface IslandContentLayerProps {
  anchor: OverlayAnchor;
  children: ReactNode;
  measurementRef: Ref<HTMLDivElement>;
}

// anchor on the layer, not the root — an exiting layer keeps the edge it entered against
const IslandContentLayer = ({
  anchor,
  children,
  measurementRef,
}: IslandContentLayerProps) => {
  const isPresent = useIsPresent();
  return (
    <m.div
      animate={ISLAND_CONTENT_MOTION.animate}
      aria-hidden={isPresent ? undefined : true}
      className="echo-island-morph-content"
      data-anchor={anchor}
      data-presence={isPresent ? "active" : "exiting"}
      exit={ISLAND_CONTENT_MOTION.exit}
      initial={ISLAND_CONTENT_MOTION.initial}
      ref={isPresent ? measurementRef : undefined}
      transition={ISLAND_CONTENT_FADE}
    >
      {children}
    </m.div>
  );
};

interface IslandMorphContentProps {
  anchor: OverlayAnchor;
  children: ReactNode;
  contentKey: string;
  measurementRef: Ref<HTMLDivElement>;
  mode: OverlayMode;
  reduceMotion: boolean;
}

const IslandMorphContent = ({
  anchor,
  children,
  contentKey,
  measurementRef,
  mode,
  reduceMotion,
}: IslandMorphContentProps) => {
  if (reduceMotion) {
    return (
      <div
        className="echo-island-morph-content"
        data-anchor={anchor}
        ref={measurementRef}
      >
        {children}
      </div>
    );
  }
  return (
    <AnimatePresence initial={false} mode="sync">
      <IslandContentLayer
        anchor={anchor}
        key={isResidentMode(mode) ? "resident" : contentKey}
        measurementRef={measurementRef}
      >
        {children}
      </IslandContentLayer>
    </AnimatePresence>
  );
};

interface ScreenOriginStyle extends CSSProperties {
  "--echo-window-x": string;
  "--echo-window-y": string;
}

interface NotchStripStyle extends CSSProperties {
  "--echo-island-notch-span": string;
  "--echo-island-notch-strip": string;
}

interface MorphFrameOptions {
  mode: OverlayMode;
  size: IslandSize | null;
  surface: OverlaySurface;
}

interface MorphFrame {
  bridgesNotch: boolean;
  frame: OverlayBox;
  isMeasured: boolean;
  shoulder: number;
  strip: number;
}

// content-sized, then stretched up over the notch — the bridged box reads as the cut-out itself, widened
const morphFrame = ({ mode, size, surface }: MorphFrameOptions): MorphFrame => {
  const box = toScreenBox(surface.island, surface.window);
  const isResident = isResidentMode(mode);
  // unmeasured surface keeps its frame — the island expands from the pill, not the reserved box
  const measured =
    isResident || size !== null
      ? toScreenBox(
          islandFrame({
            anchor: surface.anchor,
            box: surface.island,
            size: isResident ? null : size,
          }),
          surface.window
        )
      : null;
  const content = measured ?? box;
  const bridged = bridgeToNotch(
    isResident ? content : spanTheNotch(content, box, surface),
    surface
  );
  const bridgesNotch = bridged.strip > 0;
  const shoulder = dockShoulder(surface);
  return {
    bridgesNotch,
    frame: bridged.frame,
    isMeasured: measured !== null,
    shoulder,
    strip: bridged.strip,
  };
};

interface MorphTargetOptions {
  bridgesNotch: boolean;
  frame: OverlayBox;
  isDragging: boolean;
  isMeasured: boolean;
  mode: OverlayMode;
  revealsGear: boolean;
  shoulder: number;
  strip: number;
  surface: OverlaySurface;
}

// silhouette rides the same spring as the box, so the shoulders never sit off the edge mid-morph
const islandMorphTarget = ({
  bridgesNotch,
  frame,
  isDragging,
  isMeasured,
  mode,
  revealsGear,
  shoulder,
  strip,
  surface,
}: MorphTargetOptions) => ({
  ...islandCornerRadii({
    anchor: surface.anchor,
    bridgeBand: bridgesNotch ? bridgeBandOf(frame.height, strip) : null,
    isPill:
      (mode === "compact" || mode === "actions") &&
      !isSideDockedSurface(surface),
    isDragging,
    presentation: surface.presentation,
  }),
  // never "none": motion interpolates path to path, and a swap would snap the silhouette
  clipPath: dockSilhouettePath({
    anchor: surface.anchor,
    // round buttons sit in a pill whenever the toolbar floats free of the edge
    corner:
      isSideDockedSurface(surface) || mode === "actions" ? PILL_RADIUS : 0,
    gear: hasDockGearSlot(surface, mode)
      ? { revealed: revealsGear }
      : undefined,
    height: frame.height,
    isLifted: isDragging,
    shoulder,
    width: frame.width,
  }),
  scale: isDragging ? DRAG_LIFT_SCALE : 1,
  ...(isMeasured && {
    height: frame.height,
    width: frame.width,
    x: frame.x,
    y: frame.y,
  }),
});

interface IslandMorphProps {
  children: ReactNode;
  contentKey: string;
  /// Rides the whole silhouette, cut-out strip included, under the content.
  edgeLight?: ReactNode;
  /// Only the notification has one — the HUD is already on screen and never enters.
  entry?: IslandEntry;
  /// A handoff teleports the window — the island lands with it instead of springing across.
  freezesLayout?: boolean;
  isDragging?: boolean;
  mode: OverlayMode;
  onMorphComplete: () => void;
  /// Docked HUD only — grows the settings lobe out of the panel's far end.
  revealsGear?: boolean;
  surface: OverlaySurface;
  zoneRef?: Ref<HTMLDivElement>;
}

// the canvas cancels the window origin, so growing the native window cannot drag the island along
export const IslandMorph = ({
  children,
  contentKey,
  edgeLight,
  entry,
  freezesLayout,
  isDragging,
  mode,
  onMorphComplete,
  revealsGear,
  surface,
  zoneRef,
}: IslandMorphProps) => {
  const reduceMotion = useReducedMotion() === true;
  const isPresent = useIsPresent();
  const { canvasOrigin, toCanvas, transition } = useIslandLanding({
    freezesLayout: freezesLayout === true,
    isDragging: isDragging === true,
    reduceMotion,
    surface,
  });
  const { measurementRef, size } = useMeasuredIslandSize();
  const { bridgesNotch, frame, isMeasured, shoulder, strip } = morphFrame({
    mode,
    size,
    surface,
  });
  const notifyComplete = useEffectEvent(onMorphComplete);
  const reducedMotionKey = reduceMotion ? `${mode}:${contentKey}` : null;
  useEffect(() => {
    if (reducedMotionKey !== null) {
      notifyComplete();
    }
  }, [reducedMotionKey]);
  const screenOrigin: ScreenOriginStyle = {
    "--echo-window-x": `${-canvasOrigin.x}px`,
    "--echo-window-y": `${-canvasOrigin.y}px`,
  };
  // The flanks either side of the cut-out are the only part of the strip content may use.
  const notchStrip: NotchStripStyle = {
    "--echo-island-notch-span": `${bridgesNotch ? (surface.notch?.width ?? 0) : 0}px`,
    "--echo-island-notch-strip": `${strip}px`,
  };

  return (
    <div className="echo-island-screen" style={screenOrigin}>
      <m.div
        animate={islandMorphTarget({
          bridgesNotch,
          frame: toCanvas(frame),
          isDragging: isDragging === true,
          isMeasured,
          mode,
          revealsGear: revealsGear === true,
          shoulder,
          strip,
          surface,
        })}
        className="echo-island echo-island-morph"
        data-anchor={surface.anchor}
        data-component="echo-island-morph"
        data-content-key={contentKey}
        data-dragging={isDragging}
        data-mode={mode}
        data-notch-bridge={bridgesNotch}
        data-presence={isPresent ? "active" : "exiting"}
        data-presentation={surface.presentation}
        exit={entry && islandExit(entry, reduceMotion)}
        initial={entry ?? false}
        onAnimationComplete={onMorphComplete}
        ref={zoneRef}
        style={notchStrip}
        transition={transition}
      >
        {edgeLight}
        <div className="echo-island-morph-measure">
          <IslandMorphContent
            anchor={surface.anchor}
            contentKey={contentKey}
            measurementRef={measurementRef}
            mode={mode}
            reduceMotion={reduceMotion}
          >
            {children}
          </IslandMorphContent>
        </div>
      </m.div>
    </div>
  );
};
