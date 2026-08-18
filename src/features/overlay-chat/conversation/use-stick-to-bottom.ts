import { type RefObject, useEffect, useRef } from "react";

const BOTTOM_SLACK_PX = 32;

const isPinnedToBottom = (viewport: HTMLDivElement): boolean =>
  viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <=
  BOTTOM_SLACK_PX;

interface StickToBottom {
  contentRef: RefObject<HTMLDivElement | null>;
  viewportRef: RefObject<HTMLDivElement | null>;
}

/// Follows streamed answers only while the reader stays at the bottom; a new turn re-pins.
export const useStickToBottom = (pinKey: string): StickToBottom => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isPinnedRef = useRef(true);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const syncPinned = () => {
      isPinnedRef.current = isPinnedToBottom(viewport);
    };
    viewport.addEventListener("scroll", syncPinned, { passive: true });
    return () => viewport.removeEventListener("scroll", syncPinned);
  }, []);
  /// Highlighting and lazy code blocks resize long after the render that added them.
  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!(viewport && content)) {
      return;
    }
    const follow = new ResizeObserver(() => {
      if (isPinnedRef.current) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    });
    follow.observe(content);
    return () => follow.disconnect();
  }, []);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || pinKey === "") {
      return;
    }
    isPinnedRef.current = true;
    viewport.scrollTop = viewport.scrollHeight;
  }, [pinKey]);
  return { contentRef, viewportRef };
};
