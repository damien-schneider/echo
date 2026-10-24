import {
  emitTauriEvent,
  setOverlayAnchor,
  test,
  waitForTauriListener,
} from "@e2e/fixtures";
import {
  frameDrift,
  requiredBox,
  settledFrame,
} from "@e2e/overlay-island-probe";
import { expect, type Page } from "@playwright/test";

const overlayUrl =
  "/src/overlay/index.html?polish=ready&overlayPlacement=bottom";

// the shell reserves exactly the resident's own box — a mismatch reflows or crops the actions
const morphFillsResident = (page: Page) =>
  page.evaluate(() => {
    const morph = document.querySelector<HTMLElement>(
      '[data-component="echo-island-morph"]'
    );
    const resident = document.querySelector<HTMLElement>(
      ".echo-island-resident"
    );
    return (
      morph !== null &&
      resident !== null &&
      morph.offsetWidth === resident.offsetWidth &&
      morph.offsetHeight === resident.offsetHeight
    );
  });

// grip and toolbar share one centred panel — uneven gutters mean the grip shoved the actions
const residentGutterDrift = async (page: Page, isSide: boolean) => {
  const resident = await requiredBox(
    page.locator(".echo-island-resident-panel")
  );
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

test("keeps resident actions on one fixed layout while the shell reveals them", async ({
  page,
}) => {
  await page.goto(overlayUrl);
  const morph = page.locator('[data-component="echo-island-morph"]');
  const actions = page.locator(".echo-island-action");

  await expect(actions).toHaveCount(3);
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
    const residentElement = document.querySelector<HTMLElement>(
      ".echo-island-resident"
    );
    if (
      !(
        morphElement &&
        handle &&
        residentElement &&
        actionElements.length === 3
      )
    ) {
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
      residentHeight: `${residentElement.offsetHeight}px`,
      residentWidth: `${residentElement.offsetWidth}px`,
      samples,
    };
  });
  const origin = trajectory.samples[0];

  // the shell grows to the resident's own box, so actions never reflow mid-reveal
  expect(trajectory.inlineWidth).toBe(trajectory.residentWidth);
  expect(trajectory.inlineHeight).toBe(trajectory.residentHeight);
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

  const residentBox = await requiredBox(resident);
  for (const name of actionNames) {
    const action = page.getByRole("button", { name });
    // the pill's end gutter: inside the silhouette, off every action
    await resident.hover({ position: { x: 2, y: residentBox.height / 2 } });
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

test("keeps every dock edge fixed with persistent actions on the sides", async ({
  page,
}) => {
  await page.setViewportSize({ height: 620, width: 680 });
  await page.goto(overlayUrl);
  await waitForTauriListener(page, "overlay-surface");
  await waitForTauriListener(page, "overlay-pointer");
  const root = page.locator(".recording-overlay-root");
  const morph = page.locator('[data-component="echo-island-morph"]');
  const handle = page.getByRole("button", { name: "Open Echo actions" });
  const toolbar = page.getByRole("toolbar", { name: "Echo actions" });

  for (const anchor of ["left", "right", "top", "bottom"]) {
    const isSide = anchor === "left" || anchor === "right";
    await emitTauriEvent(page, "overlay-pointer", {
      inside: false,
      x: 0,
      y: 0,
    });
    await setOverlayAnchor(page, anchor, "docked");
    await expect(root).toHaveAttribute("data-anchor", anchor);
    if (isSide) {
      await expect(handle).toHaveCount(0);
      await expect(toolbar).toBeVisible();
      await expect.poll(() => morphFillsResident(page)).toBe(true);
    } else {
      await expect(handle).toBeVisible();
      await expect(toolbar).toBeHidden();
      await expect(morph).toHaveCSS("width", "38px");
      await expect(morph).toHaveCSS("height", "5px");
    }
    const compact = await settledFrame(morph);

    await emitTauriEvent(page, "overlay-pointer", {
      inside: true,
      x: 0,
      y: 0,
    });
    if (isSide) {
      await morph.hover();
    }
    await expect(toolbar).toBeVisible();
    await expect.poll(() => morphFillsResident(page)).toBe(true);
    const grip = page.getByRole("button", { name: "Move Echo control" });
    await expect(grip).toHaveCount(1);
    await expect(grip).toHaveAttribute("data-live", "true");
    expect(await residentGutterDrift(page, isSide)).toBeLessThanOrEqual(1);
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
