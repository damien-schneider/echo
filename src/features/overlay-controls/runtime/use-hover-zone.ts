import { useState } from "react";
import {
  HOVERED_ATTRIBUTE,
  NATIVE_HOVER_ATTRIBUTE,
} from "@/features/overlay-controls/runtime/native-hover";

const hoverIsNative = () =>
  document.documentElement.hasAttribute(NATIVE_HOVER_ATTRIBUTE);

/// The script twin of the `hover` CSS variant: native samples paint the zone at once, WebKit's trailing pointer events count only until they flow.
export const useHoverZone = () => {
  const [isHovered, setHovered] = useState(false);

  const zoneRef = (zone: HTMLElement | null) => {
    if (zone === null) {
      return;
    }
    const follow = (isPointerInside: boolean) =>
      setHovered(
        hoverIsNative() ? zone.hasAttribute(HOVERED_ATTRIBUTE) : isPointerInside
      );
    const enter = () => follow(true);
    const leave = () => follow(false);
    follow(zone.matches(":hover"));
    const observer = new MutationObserver(() =>
      setHovered(zone.hasAttribute(HOVERED_ATTRIBUTE))
    );
    observer.observe(zone, { attributeFilter: [HOVERED_ATTRIBUTE] });
    zone.addEventListener("pointerenter", enter);
    zone.addEventListener("pointerleave", leave);
    return () => {
      observer.disconnect();
      zone.removeEventListener("pointerenter", enter);
      zone.removeEventListener("pointerleave", leave);
    };
  };

  return { isHovered, zoneRef };
};
