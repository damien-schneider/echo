import {
  emitTauriEvent,
  NOTIFICATION_URL,
  requestNotificationSurface,
  setOverlayAnchor,
  setOverlayNotch,
  test,
  waitForTauriListener,
} from "@e2e/fixtures";
import { expect, type Locator, type Page } from "@playwright/test";

const overlayUrl =
  "/src/overlay/index.html?polish=ready&overlayPlacement=bottom";

// A teleport covers the whole travel in one frame; a spring never does.
const TELEPORT_STEP_PX = 120;

interface Frame {
  height: number;
  width: number;
  x: number;
  y: number;
}

const frameDrift = (frame: Frame, reference: Frame) =>
  Math.max(
    Math.abs(frame.x - reference.x),
    Math.abs(frame.y - reference.y),
    Math.abs(frame.width - reference.width),
    Math.abs(frame.height - reference.height)
  );

// Springs settle asymptotically: sample once two frames land on each other.
const settledFrame = async (morph: Locator): Promise<Frame> => {
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

const requiredBox = async (locator: Locator): Promise<Frame> => {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("Element is not laid out");
  }
  return box;
};

// grip and toolbar share one centred row — uneven gutters mean the grip shoved the actions
const residentGutterDrift = async (page: Page, isSide: boolean) => {
  const resident = await requiredBox(page.locator(".echo-island-resident"));
  const grip = await requiredBox(
    page.getByRole("button", { name: "Move Echo control" })
  );
  const toolbar = await requiredBox(
    page.getByRole("toolbar", { name: "Echo actions" })
  );
  if (isSide) {
    const trailing =
      resident.y + resident.height - (toolbar.y + toolbar.height);
    return Math.abs(grip.y - resident.y - trailing);
  }
  const trailing = resident.x + resident.width - (toolbar.x + toolbar.width);
  return Math.abs(grip.x - resident.x - trailing);
};

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

const samplePolishCloseTrajectory = async (
  page: import("@playwright/test").Page
) =>
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

test("keeps resident actions on one fixed layout while the shell reveals them", async ({
  page,
}) => {
  await page.goto(overlayUrl);
  const morph = page.locator('[data-component="echo-island-morph"]');
  const resident = page.locator(".echo-island-resident");
  const actions = page.locator(".echo-island-action");

  await expect(actions).toHaveCount(3);
  await expect(resident).toHaveCSS("width", "128px");
  await expect(resident).toHaveCSS("height", "40px");
  await expect(morph).toHaveCSS("width", "38px");
  await expect(morph).toHaveCSS("height", "5px");

  const trajectory = await page.evaluate(async () => {
    const actionElements = [
      ...document.querySelectorAll<HTMLElement>(".echo-island-action"),
    ];
    const morphElement = document.querySelector<HTMLElement>(
      '[data-component="echo-island-morph"]'
    );
    const handle = document.querySelector<HTMLElement>(
      ".echo-island-handle-hitbox"
    );
    if (!(morphElement && handle && actionElements.length === 3)) {
      throw new Error("Resident action layout is incomplete");
    }
    const readPositions = () =>
      actionElements.map((action) => {
        const bounds = action.getBoundingClientRect();
        return { x: bounds.x, y: bounds.y };
      });
    const samples = [readPositions()];
    handle.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    for (let frame = 0; frame < 30; frame += 1) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      samples.push(readPositions());
    }
    return {
      inlineHeight: morphElement.style.height,
      inlineWidth: morphElement.style.width,
      samples,
    };
  });
  const origin = trajectory.samples[0];

  expect(trajectory.inlineWidth).toBe("128px");
  expect(trajectory.inlineHeight).toBe("40px");
  expect(
    Math.max(
      ...trajectory.samples.flatMap((sample) =>
        sample.map((position, index) =>
          Math.max(
            Math.abs(position.x - origin[index].x),
            Math.abs(position.y - origin[index].y)
          )
        )
      )
    )
  ).toBeLessThanOrEqual(0.5);
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

test("gives every resident action clear hover feedback", async ({ page }) => {
  await page.goto(overlayUrl);
  await page.getByRole("button", { name: "Open Echo actions" }).hover();
  const resident = page.locator(".echo-island-resident");
  const toolbar = page.getByRole("toolbar", { name: "Echo actions" });
  const actionNames = [
    "Start recording",
    "Open Echo chat",
    "Polish selected text",
  ];

  for (const name of actionNames) {
    const action = page.getByRole("button", { name });
    await resident.hover({ position: { x: 1, y: 1 } });
    await page.waitForTimeout(120);
    const resting = await action.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        boxShadow: style.boxShadow,
        scale: style.scale,
      };
    });

    await action.hover();
    await page.waitForTimeout(120);
    const hovered = await action.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        boxShadow: style.boxShadow,
        scale: style.scale,
      };
    });

    expect(hovered.backgroundColor, `${name} background`).not.toBe(
      resting.backgroundColor
    );
    expect(hovered.boxShadow, `${name} shadow`).toBe("none");
    expect(hovered.scale, `${name} scale`).not.toBe(resting.scale);
    await expect(toolbar).toBeVisible();
  }
});

test("keeps the bottom edge and horizontal center pinned while hover expands", async ({
  page,
}) => {
  await page.goto(overlayUrl);
  await page.waitForSelector(".echo-island-handle-hitbox");
  const trajectory = await page.evaluate(async () => {
    const morph = document.querySelector<HTMLElement>(
      '[data-component="echo-island-morph"]'
    );
    const handle = document.querySelector<HTMLElement>(
      ".echo-island-handle-hitbox"
    );
    if (!(morph && handle)) {
      throw new Error("Echo island morph is missing");
    }
    const readBounds = () => {
      const bounds = morph.getBoundingClientRect();
      return {
        bottom: bounds.bottom,
        centerX: bounds.left + bounds.width / 2,
        height: bounds.height,
      };
    };
    const samples = [readBounds()];
    handle.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    for (let frame = 0; frame < 50; frame += 1) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      samples.push(readBounds());
    }
    return samples;
  });
  const start = trajectory[0];
  const end = trajectory.at(-1) ?? start;
  expect(
    Math.max(
      ...trajectory.map((sample) => Math.abs(sample.bottom - start.bottom))
    )
  ).toBeLessThanOrEqual(1);
  expect(
    Math.max(
      ...trajectory.map((sample) => Math.abs(sample.centerX - start.centerX))
    )
  ).toBeLessThanOrEqual(1);
  expect(end.height - start.height).toBeGreaterThan(20);
  expect(
    trajectory.some(
      (sample) =>
        sample.height > start.height + 1 && sample.height < end.height - 1
    )
  ).toBe(true);
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

test("keeps every dock edge fixed with persistent actions on the sides", async ({
  page,
}) => {
  await page.setViewportSize({ height: 620, width: 680 });
  await page.goto(overlayUrl);
  await waitForTauriListener(page, "overlay-surface");
  await waitForTauriListener(page, "overlay-pointer-boundary");
  const root = page.locator(".recording-overlay-root");
  const morph = page.locator('[data-component="echo-island-morph"]');
  const handle = page.getByRole("button", { name: "Open Echo actions" });
  const toolbar = page.getByRole("toolbar", { name: "Echo actions" });

  for (const anchor of ["left", "right", "top", "bottom"]) {
    const isSide = anchor === "left" || anchor === "right";
    await emitTauriEvent(page, "overlay-pointer-boundary", false);
    await setOverlayAnchor(page, anchor, "docked");
    await expect(root).toHaveAttribute("data-anchor", anchor);
    if (isSide) {
      await expect(handle).toHaveCount(0);
      await expect(toolbar).toBeVisible();
      await expect(morph).toHaveCSS("width", "32px");
      await expect(morph).toHaveCSS("height", "124px");
    } else {
      await expect(handle).toBeVisible();
      await expect(toolbar).toBeHidden();
      await expect(morph).toHaveCSS("width", "38px");
      await expect(morph).toHaveCSS("height", "5px");
    }
    const compact = await settledFrame(morph);
    expect([Math.round(compact.width), Math.round(compact.height)]).toEqual(
      isSide ? [32, 124] : [38, 5]
    );

    await emitTauriEvent(page, "overlay-pointer-boundary", true);
    if (isSide) {
      await morph.hover();
    }
    await expect(toolbar).toBeVisible();
    await expect(morph).toHaveCSS("width", isSide ? "32px" : "128px");
    await expect(morph).toHaveCSS("height", isSide ? "124px" : "40px");
    const grip = page.getByRole("button", { name: "Move Echo control" });
    await expect(grip).toHaveCount(1);
    await expect(grip).toHaveCSS("width", "20px");
    await expect(grip).toHaveCSS("height", "20px");
    await expect(grip).toHaveCSS("opacity", "0.5");
    expect(await residentGutterDrift(page, isSide)).toBeLessThanOrEqual(1);
    await expect(grip.locator("svg")).toHaveCSS("width", "12px");
    await expect(grip.locator("svg")).toHaveCSS("height", "12px");
    await expect(grip.locator("svg")).toHaveCSS(
      "rotate",
      isSide ? "none" : "90deg"
    );
    const expanded = await settledFrame(morph);

    expect(expanded.x).toBeGreaterThanOrEqual(-1);
    expect(expanded.y).toBeGreaterThanOrEqual(-1);
    expect(expanded.x + expanded.width).toBeLessThanOrEqual(681);
    expect(expanded.y + expanded.height).toBeLessThanOrEqual(621);
    if (anchor === "left") {
      expect(Math.abs(expanded.x)).toBeLessThanOrEqual(1);
      expect(frameDrift(expanded, compact)).toBeLessThanOrEqual(1);
    } else if (anchor === "right") {
      expect(Math.abs(680 - expanded.x - expanded.width)).toBeLessThanOrEqual(
        1
      );
      expect(frameDrift(expanded, compact)).toBeLessThanOrEqual(1);
    } else if (anchor === "top") {
      expect(Math.abs(compact.y - expanded.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(expanded.y)).toBeLessThanOrEqual(1);
      expect(expanded.height - compact.height).toBeGreaterThan(20);
    } else {
      expect(
        Math.abs(compact.y + compact.height - (expanded.y + expanded.height))
      ).toBeLessThanOrEqual(1);
      expect(Math.abs(620 - expanded.y - expanded.height)).toBeLessThanOrEqual(
        1
      );
      expect(expanded.height - compact.height).toBeGreaterThan(20);
    }
  }
});

test("preserves centered four-pixel inset bars", async ({ page }) => {
  await page.setViewportSize({ height: 620, width: 680 });
  await page.goto(overlayUrl);
  await waitForTauriListener(page, "overlay-surface");
  const root = page.locator(".recording-overlay-root");
  const morph = page.locator('[data-component="echo-island-morph"]');

  for (const anchor of ["top", "bottom"]) {
    await setOverlayAnchor(page, anchor, "bar");
    await expect(morph).toHaveCSS("width", "38px");
    await expect(morph).toHaveCSS("height", "5px");
    await expect(root).toHaveAttribute("data-anchor", anchor);
    await expect(root).toHaveAttribute("data-presentation", "bar");
    await expect
      .poll(async () => {
        const box = await morph.boundingBox();
        if (!box) {
          return null;
        }
        return Math.round(anchor === "top" ? box.y : 620 - box.y - box.height);
      })
      .toBe(4);
    const box = await morph.boundingBox();
    expect(box).not.toBeNull();
    if (!box) {
      continue;
    }
    expect([Math.round(box.width), Math.round(box.height)]).toEqual([38, 5]);
    expect(Math.abs(box.x + box.width / 2 - 340)).toBeLessThanOrEqual(1);
  }
});
