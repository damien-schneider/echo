import {
  emitTauriEvent,
  NOTIFICATION_URL,
  requestNotificationSurface,
  setOverlayAnchor,
  setOverlayNotch,
  test,
  waitForTauriListener,
} from "@e2e/fixtures";
import { settledFrame } from "@e2e/overlay-island-probe";
import { expect, type Page } from "@playwright/test";

const overlayUrl =
  "/src/overlay/index.html?polish=ready&overlayPlacement=bottom";

// A teleport covers the whole travel in one frame; a spring never does.
const TELEPORT_STEP_PX = 120;

const maximumStep = (samples: Array<{ x: number; y: number }>) =>
  samples.reduce(
    (largest, sample, index) =>
      index === 0
        ? largest
        : Math.max(
            largest,
            Math.abs(sample.x - samples[index - 1].x),
            Math.abs(sample.y - samples[index - 1].y)
          ),
    0
  );

const samplePolishCloseTrajectory = (page: Page) =>
  page.evaluate(async () => {
    const heading = [...document.querySelectorAll("h2")].find(
      (element) => element.textContent === "Polish"
    );
    const close = document.querySelector<HTMLButtonElement>(
      '[aria-label="Close Polish model panel"]'
    );
    if (!(heading && close)) {
      throw new Error("Polish panel controls are missing");
    }
    const readPosition = () => {
      const bounds = heading.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y };
    };
    const samples = [readPosition()];
    close.click();
    for (let frame = 0; frame < 14; frame += 1) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      if (!heading.isConnected) {
        break;
      }
      samples.push(readPosition());
    }
    return samples;
  });

test("closes the Polish panel without teleporting its content", async ({
  page,
}) => {
  await page.goto(`${NOTIFICATION_URL}?polish=not_downloaded`);
  await waitForTauriListener(page, "overlay-notification-request");
  await requestNotificationSurface(page, "panel");
  await expect(page.getByRole("heading", { name: "Polish" })).toBeVisible();

  const trajectory = await samplePolishCloseTrajectory(page);

  expect(trajectory.length).toBeGreaterThan(2);
  expect(maximumStep(trajectory)).toBeLessThanOrEqual(TELEPORT_STEP_PX);
});

test("opens active work at the notch instead of travelling there", async ({
  page,
}) => {
  await page.setViewportSize({ height: 620, width: 680 });
  await page.goto(`${NOTIFICATION_URL}?polish=ready`);
  await waitForTauriListener(page, "show-overlay");
  await emitTauriEvent(page, "show-overlay", {
    message: "Polishing…",
    state: "processing",
  });
  await expect(page.locator(".recording-overlay-root")).toHaveAttribute(
    "data-anchor",
    "top"
  );
  const trajectory = await page.evaluate(async () => {
    const samples: Array<{ width: number; x: number; y: number }> = [];
    for (let frame = 0; frame < 50; frame += 1) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      const morph = document.querySelector<HTMLElement>(
        '[data-component="echo-island-morph"]'
      );
      if (morph) {
        const bounds = morph.getBoundingClientRect();
        samples.push({
          width: bounds.width,
          x: bounds.left + bounds.width / 2 - innerWidth / 2,
          y: bounds.top,
        });
      }
    }
    return samples;
  });
  const start = trajectory[0];
  const end = trajectory.at(-1) ?? start;

  expect(maximumStep(trajectory)).toBeLessThanOrEqual(TELEPORT_STEP_PX);
  // It is born at the top edge and stays centred: only its size travels.
  expect(
    Math.max(...trajectory.map((sample) => Math.abs(sample.x)))
  ).toBeLessThanOrEqual(1);
  expect(Math.max(...trajectory.map((sample) => sample.y))).toBeLessThanOrEqual(
    5
  );
  expect(end.width - start.width).toBeGreaterThan(50);
});

test("hangs active work off the hardware notch with no daylight beside it", async ({
  page,
}) => {
  await page.setViewportSize({ height: 620, width: 680 });
  await page.goto(`${NOTIFICATION_URL}?polish=ready`);
  await waitForTauriListener(page, "show-overlay");
  await setOverlayNotch(page, { centerOffset: 0, topInset: 32, width: 196 });
  await emitTauriEvent(page, "show-overlay", {
    message: "Polishing…",
    state: "processing",
  });

  const root = page.locator(".recording-overlay-root");
  await expect(root).toHaveAttribute("data-anchor", "top");
  await expect(root).toHaveAttribute("data-hardware-notch", "true");
  const morph = page.locator('[data-component="echo-island-morph"]');
  await expect(morph).toHaveAttribute("data-notch-bridge", "true");
  await expect(morph).toHaveCSS("border-top-left-radius", "0px");
  await expect(morph).toHaveCSS("border-top-right-radius", "0px");
  // half the 52px band under the cut-out — the curve grows from the notch, not the panel default
  await expect(morph).toHaveCSS("border-bottom-left-radius", "26px");
  await page.waitForTimeout(400);

  const bridged = await page.evaluate(() => {
    const island = document.querySelector<HTMLElement>(
      '[data-component="echo-island-morph"]'
    );
    const activity = document.querySelector<HTMLElement>(
      ".echo-island-activity"
    );
    if (!(island && activity)) {
      throw new Error("Bridged island geometry is unavailable");
    }
    const islandBox = island.getBoundingClientRect();
    return {
      contentTop: activity.getBoundingClientRect().top,
      left: islandBox.left,
      right: islandBox.right,
      top: islandBox.top,
    };
  });
  const notch = { left: 680 / 2 - 98, right: 680 / 2 + 98 };

  expect(Math.round(bridged.top)).toBe(0);
  expect(bridged.left).toBeLessThanOrEqual(notch.left);
  expect(bridged.right).toBeGreaterThanOrEqual(notch.right);
  expect(bridged.contentTop).toBeGreaterThanOrEqual(32);
});

test("grows a fresh recording straight out of the notch", async ({ page }) => {
  await page.setViewportSize({ height: 620, width: 680 });
  await page.goto(`${NOTIFICATION_URL}?polish=ready`);
  await waitForTauriListener(page, "show-overlay");
  await setOverlayNotch(page, { centerOffset: 0, topInset: 32, width: 196 });
  await emitTauriEvent(page, "show-overlay", "recording");

  const morph = page.locator('[data-component="echo-island-morph"]');
  await expect(page.locator(".echo-island-activity")).toHaveAttribute(
    "data-has-text",
    "false"
  );
  await expect(morph).toHaveAttribute("data-notch-bridge", "true");
  const settled = await settledFrame(morph);

  expect(Math.round(settled.y)).toBe(0);
  expect(settled.x).toBeLessThanOrEqual(680 / 2 - 98);
  expect(settled.x + settled.width).toBeGreaterThanOrEqual(680 / 2 + 98);
});

test("leaves the resting handle floating below the notch", async ({ page }) => {
  await page.setViewportSize({ height: 620, width: 680 });
  await page.goto(overlayUrl);
  await waitForTauriListener(page, "overlay-surface");
  await setOverlayAnchor(page, "top", "bar");
  await setOverlayNotch(page, { centerOffset: 0, topInset: 32, width: 196 });

  const morph = page.locator('[data-component="echo-island-morph"]');
  await expect(morph).toHaveAttribute("data-notch-bridge", "false");
  await expect(morph).toHaveCSS("border-top-left-radius", "999px");
  await expect
    .poll(async () => (await morph.boundingBox())?.y)
    .toBeGreaterThanOrEqual(32);
});
