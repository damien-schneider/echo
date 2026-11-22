import { AnimatePresence, m } from "motion/react";
import type { ReactNode } from "react";

const GLYPH_HIDDEN = { filter: "blur(4px)", opacity: 0, scale: 0.25 } as const;
const GLYPH_SHOWN = { filter: "blur(0px)", opacity: 1, scale: 1 } as const;
const GLYPH_SWAP = { bounce: 0, duration: 0.3, type: "spring" } as const;

interface GlyphSwapProps {
  children: ReactNode;
  glyph: string;
}

export const GlyphSwap = ({ children, glyph }: GlyphSwapProps) => (
  <span className="grid place-items-center">
    <AnimatePresence initial={false}>
      <m.span
        animate={GLYPH_SHOWN}
        className="grid place-items-center [grid-area:1/1]"
        exit={GLYPH_HIDDEN}
        initial={GLYPH_HIDDEN}
        key={glyph}
        transition={GLYPH_SWAP}
      >
        {children}
      </m.span>
    </AnimatePresence>
  </span>
);
