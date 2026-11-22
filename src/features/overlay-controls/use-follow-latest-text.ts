import { type RefObject, useEffect } from "react";

/// Live words grow at the end: the box scrolls to its end on either axis so the newest stay in view.
export const useFollowLatestText = (
  text: string,
  ref: RefObject<HTMLElement | null>
) => {
  useEffect(() => {
    if (!(text && ref.current)) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const box = ref.current;
      if (box) {
        box.scrollLeft = box.scrollWidth;
        box.scrollTop = box.scrollHeight;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [text, ref]);
};
