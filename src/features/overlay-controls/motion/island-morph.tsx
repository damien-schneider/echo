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
import { islandCornerRadii } from "@/features/overlay-controls/motion/island-corners";
import { useMeasuredIslandSize } from "@/features/overlay-controls/motion/island-measurement";
import type { IslandEntry } from "@/features/overlay-controls/motion/notch-entry";
import { isSideDockedSurface } from "@/features/overlay-controls/overlay-presentation";
import type { OverlayMode } from "@/features/overlay-controls/recording-overlay-state";
import {
  bridgeToNotch,
  islandFrame,
  type OverlayAnchor,
  type OverlaySurface,
  toScreenBox,
} from "@/features/overlay-controls/runtime/overlay-surface";
import "@/features/overlay-controls/motion/island-morph.css";

const ISLAND_LAYOUT_SPRING = {
  damping: 34,
  mass: 0.65,
  stiffness: 600,
  type: "spring",
} as const;

const ISLAND_CONTENT_SPRING = {
  damping: 28,
  mass: 0.58,
  stiffness: 540,
  type: "spring",
} as const;

const ISLAND_CONTENT_MOTION = {
  animate: { filter: "blur(0px)", opacity: 1 },
  exit: {
    filter: "blur(4px)",
    opacity: 0,
    transition: { duration: 0.16, ease: [0.4, 0, 1, 1] },
  },
  initial: { filter: "blur(7px)", opacity: 0 },
} as const;

const INSTANT = { duration: 0 } as const;

const LAYOUT_TRANSITION = {
  borderBottomLeftRadius: ISLAND_LAYOUT_SPRING,
  borderBottomRightRadius: ISLAND_LAYOUT_SPRING,
  borderTopLeftRadius: ISLAND_LAYOUT_SPRING,
  borderTopRightRadius: ISLAND_LAYOUT_SPRING,
  height: ISLAND_LAYOUT_SPRING,
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
      transition={ISLAND_CONTENT_SPRING}
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
  "--echo-island-notch-strip": string;
}

interface IslandMorphProps {
  children: ReactNode;
  contentKey: string;
  /// Only the notification has one — the HUD is already on screen and never enters.
  entry?: IslandEntry;
  /// A handoff teleports the window — the island lands with it instead of springing across.
  freezesLayout?: boolean;
  isDragging?: boolean;
  mode: OverlayMode;
  onMorphComplete: () => void;
  surface: OverlaySurface;
}

// the canvas cancels the window origin, so growing the native window cannot drag the island along
export const IslandMorph = ({
  children,
  contentKey,
  entry,
  freezesLayout,
  isDragging,
  mode,
  onMorphComplete,
  surface,
}: IslandMorphProps) => {
  const reduceMotion = useReducedMotion() === true;
  const { measurementRef, size } = useMeasuredIslandSize();
  const isResident = isResidentMode(mode);
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
  const bridged = bridgeToNotch(
    measured ?? toScreenBox(surface.island, surface.window),
    surface
  );
  // unmeasured surface keeps its frame — the island expands from the pill, not the reserved box
  const frameTarget = measured === null ? null : bridged.frame;
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
  // The content keeps its place while the frame reaches past it to the notch.
  const notchStrip: NotchStripStyle = {
    "--echo-island-notch-strip": `${bridged.strip}px`,
  };

  return (
    <div className="echo-island-screen" style={screenOrigin}>
      <m.div
        animate={{
          ...islandCornerRadii({
            anchor: surface.anchor,
            bridgesNotch: bridged.strip > 0,
            isCompactHandle:
              mode === "compact" && !isSideDockedSurface(surface),
            isDragging,
            presentation: surface.presentation,
          }),
          ...(frameTarget && {
            height: frameTarget.height,
            width: frameTarget.width,
            x: frameTarget.x,
            y: frameTarget.y,
          }),
        }}
        className="echo-island echo-island-morph"
        data-anchor={surface.anchor}
        data-component="echo-island-morph"
        data-content-key={contentKey}
        data-dragging={isDragging}
        data-mode={mode}
        data-notch-bridge={bridged.strip > 0}
        data-presentation={surface.presentation}
        exit={entry}
        initial={entry ?? false}
        onAnimationComplete={onMorphComplete}
        style={notchStrip}
        transition={reduceMotion || freezesLayout ? INSTANT : LAYOUT_TRANSITION}
      >
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

export const PolishProcessingOrbit = () => (
  <span aria-hidden="true" className="echo-island-processing-orbit" />
);
