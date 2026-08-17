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
import { islandCornerRadii } from "@/features/overlay-controls/motion/island-corners";
import { useMeasuredIslandSize } from "@/features/overlay-controls/motion/island-measurement";
import type { IslandEntry } from "@/features/overlay-controls/motion/notch-entry";
import { isSideDockedSurface } from "@/features/overlay-controls/overlay-presentation";
import type {
  IslandEdge,
  OverlayMode,
} from "@/features/overlay-controls/recording-overlay-state";
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

// stiff and barely under critical damping — the island lands once instead of ringing
const ISLAND_LAYOUT_SPRING = {
  damping: 36,
  mass: 0.55,
  stiffness: 700,
  type: "spring",
} as const;

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

const INSTANT = { duration: 0 } as const;

const LAYOUT_TRANSITION = {
  borderBottomLeftRadius: ISLAND_LAYOUT_SPRING,
  borderBottomRightRadius: ISLAND_LAYOUT_SPRING,
  borderTopLeftRadius: ISLAND_LAYOUT_SPRING,
  borderTopRightRadius: ISLAND_LAYOUT_SPRING,
  clipPath: ISLAND_LAYOUT_SPRING,
  height: ISLAND_LAYOUT_SPRING,
  scale: ISLAND_LAYOUT_SPRING,
  width: ISLAND_LAYOUT_SPRING,
  x: ISLAND_LAYOUT_SPRING,
  y: ISLAND_LAYOUT_SPRING,
} as const;

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
  isDragging: boolean;
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
const morphFrame = ({
  isDragging,
  mode,
  size,
  surface,
}: MorphFrameOptions): MorphFrame => {
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
  const shoulder = dockShoulder({
    anchor: surface.anchor,
    isDragging,
    mode,
    presentation: surface.presentation,
  });
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
  shoulder,
  strip,
  surface,
}: MorphTargetOptions) => ({
  ...islandCornerRadii({
    anchor: surface.anchor,
    bridgeBand: bridgesNotch ? frame.height - strip : null,
    isCompactHandle: mode === "compact" && !isSideDockedSurface(surface),
    isDragging,
    presentation: surface.presentation,
  }),
  // never "none": motion interpolates path to path, and a swap would snap the silhouette
  clipPath: dockSilhouettePath({
    anchor: surface.anchor,
    height: frame.height,
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
  /// Rides the whole silhouette, cut-out strip included, never the content box inside it.
  edge?: IslandEdge | null;
  /// Only the notification has one — the HUD is already on screen and never enters.
  entry?: IslandEntry;
  /// A handoff teleports the window — the island lands with it instead of springing across.
  freezesLayout?: boolean;
  isDragging?: boolean;
  /// Listening energy lands here — the ambience only exists while edge is "ambience".
  microphoneRef?: Ref<HTMLSpanElement>;
  mode: OverlayMode;
  onMorphComplete: () => void;
  surface: OverlaySurface;
}

// the canvas cancels the window origin, so growing the native window cannot drag the island along
export const IslandMorph = ({
  children,
  contentKey,
  edge,
  entry,
  freezesLayout,
  isDragging,
  microphoneRef,
  mode,
  onMorphComplete,
  surface,
}: IslandMorphProps) => {
  const reduceMotion = useReducedMotion() === true;
  const { measurementRef, size } = useMeasuredIslandSize();
  const { bridgesNotch, frame, isMeasured, shoulder, strip } = morphFrame({
    isDragging: isDragging === true,
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
    "--echo-window-x": `${-surface.window.x}px`,
    "--echo-window-y": `${-surface.window.y}px`,
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
          frame,
          isDragging: isDragging === true,
          isMeasured,
          mode,
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
        data-presentation={surface.presentation}
        exit={entry}
        initial={entry ?? false}
        onAnimationComplete={onMorphComplete}
        style={notchStrip}
        transition={reduceMotion || freezesLayout ? INSTANT : LAYOUT_TRANSITION}
      >
        {edge === "trace" ? (
          <span aria-hidden="true" className="echo-island-edge-trace" />
        ) : null}
        {edge === "ambience" ? (
          <span
            aria-hidden="true"
            className="echo-island-microphone-ambience"
            ref={microphoneRef}
          />
        ) : null}
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
