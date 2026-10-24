import { emitTauriEvent } from "@e2e/fixtures";
import { expect, type Locator, type Page } from "@playwright/test";

export interface Frame {
  height: number;
  width: number;
  x: number;
  y: number;
}

export const frameDrift = (frame: Frame, reference: Frame) =>
  Math.max(
    Math.abs(frame.x - reference.x),
    Math.abs(frame.y - reference.y),
    Math.abs(frame.width - reference.width),
    Math.abs(frame.height - reference.height)
  );

// Springs settle asymptotically: sample once two frames land on each other.
export const settledFrame = async (morph: Locator): Promise<Frame> => {
  let previous: Frame | null = null;
  await expect
    .poll(async () => {
      const current = await morph.boundingBox();
      const isSettled =
        previous !== null &&
        current !== null &&
        frameDrift(current, previous) < 0.5;
      previous = current;
      return isSettled;
    })
    .toBe(true);
  if (previous === null) {
    throw new Error("Island frame never settled");
  }
  return previous;
};

export const requiredBox = async (locator: Locator): Promise<Frame> => {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("Element is not laid out");
  }
  return box;
};

// macOS sends no DOM pointer events until the panel is key — Rust reports the pointer instead.
export const pointNative = (page: Page, inside: boolean) =>
  emitTauriEvent(page, "overlay-pointer", { inside, x: 0, y: 0 });
