import { expect } from "@playwright/test";
import {
  emitTauriEvent,
  invokedCommands,
  test,
  waitForTauriListener,
} from "./fixtures";

// The payload is the exact docked island box Rust reserves.
const BOTTOM_DOCK = {
  anchor: "bottom",
  height: 40,
  width: 228,
  x: 286,
  y: 560,
} as const;

const LEFT_DOCK = {
  anchor: "left",
  height: 228,
  width: 40,
  x: 0,
  y: 186,
} as const;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ height: 600, width: 800 });
  await page.goto("/src/overlay/snap-preview.html");
  await waitForTauriListener(page, "overlay-snap-preview");
  await waitForTauriListener(page, "overlay-snap-preview-dismiss");
});

test("morphs the ghost to the predicted dock edge", async ({ page }) => {
  const preview = page.locator(".echo-snap-preview");
  const shape = page.locator(".echo-snap-preview-shape");
  const silhouette = () =>
    shape.evaluate((element) => getComputedStyle(element).clipPath);

  await emitTauriEvent(page, "overlay-snap-preview", BOTTOM_DOCK);
  await expect(preview).toHaveAttribute("data-state", "visible");
  await expect(preview).toHaveAttribute("data-anchor", "bottom");
  await expect(shape).toHaveCSS("width", `${BOTTOM_DOCK.width}px`);
  await expect(shape).toHaveCSS("height", `${BOTTOM_DOCK.height}px`);
  // the ghost is the island's own silhouette — a ring would read as a second HUD
  await expect(shape).toHaveCSS("box-shadow", "none");
  await expect.poll(silhouette).toContain("path(");
  const bottomSilhouette = await silhouette();

  await emitTauriEvent(page, "overlay-snap-preview", LEFT_DOCK);
  await page.waitForTimeout(60);
  const transitioningBox = await preview.boundingBox();
  expect(transitioningBox).not.toBeNull();
  expect(transitioningBox?.width).toBeGreaterThan(LEFT_DOCK.width);
  expect(transitioningBox?.width).toBeLessThan(BOTTOM_DOCK.width);
  expect(transitioningBox?.height).toBeGreaterThan(BOTTOM_DOCK.height);
  expect(transitioningBox?.height).toBeLessThan(LEFT_DOCK.height);

  await expect(preview).toHaveCSS("width", `${LEFT_DOCK.width}px`);
  await expect(preview).toHaveCSS("height", `${LEFT_DOCK.height}px`);
  await expect(shape).toHaveCSS("width", `${LEFT_DOCK.width}px`);
  await expect(shape).toHaveCSS("height", `${LEFT_DOCK.height}px`);
  await expect.poll(silhouette).not.toBe(bottomSilhouette);
  await expect(preview).toHaveAttribute("data-glide", "false");
});

test("tracks the pointer along one edge without animating", async ({
  page,
}) => {
  const preview = page.locator(".echo-snap-preview");

  await emitTauriEvent(page, "overlay-snap-preview", BOTTOM_DOCK);
  await expect(preview).toHaveAttribute("data-state", "visible");

  await emitTauriEvent(page, "overlay-snap-preview", {
    ...BOTTOM_DOCK,
    x: 120,
  });
  await expect.poll(async () => (await preview.boundingBox())?.x).toBe(120);
  await expect(preview).toHaveAttribute("data-glide", "false");
});

test("coalesces a burst of pointer samples into the last frame", async ({
  page,
}) => {
  const preview = page.locator(".echo-snap-preview");

  await page.evaluate((frame) => {
    for (let step = 0; step < 24; step += 1) {
      window.__ECHO_TEST__.emit("overlay-snap-preview", {
        ...frame,
        x: 100 + step * 10,
      });
    }
  }, BOTTOM_DOCK);

  await expect.poll(async () => (await preview.boundingBox())?.x).toBe(330);
  await expect(preview).toHaveAttribute("data-state", "visible");
});

test("fades out and hides the window after the drop", async ({ page }) => {
  const preview = page.locator(".echo-snap-preview");

  await emitTauriEvent(page, "overlay-snap-preview", BOTTOM_DOCK);
  await expect(preview).toHaveAttribute("data-state", "visible");

  await emitTauriEvent(page, "overlay-snap-preview-dismiss", null);
  await expect(preview).toHaveAttribute("data-state", "committed");
  await expect
    .poll(async () =>
      (await invokedCommands(page)).includes("plugin:window|hide")
    )
    .toBe(true);
  await expect(preview).toHaveAttribute("data-state", "hidden");
});

test("a drag starting inside the fade keeps the placeholder on screen", async ({
  page,
}) => {
  const preview = page.locator(".echo-snap-preview");

  await emitTauriEvent(page, "overlay-snap-preview", BOTTOM_DOCK);
  await expect(preview).toHaveAttribute("data-state", "visible");
  await emitTauriEvent(page, "overlay-snap-preview-dismiss", null);
  await emitTauriEvent(page, "overlay-snap-preview", LEFT_DOCK);

  await expect(preview).toHaveAttribute("data-state", "visible");
  await page.waitForTimeout(220);
  await expect(preview).toHaveAttribute("data-state", "visible");
  expect((await invokedCommands(page)).includes("plugin:window|hide")).toBe(
    false
  );
});
