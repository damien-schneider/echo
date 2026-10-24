import {
  emitTauriEvent,
  invokedCommands,
  test,
  waitForTauriListener,
} from "@e2e/fixtures";
import { pointNative, requiredBox } from "@e2e/overlay-island-probe";
import { expect, type Locator, type Page } from "@playwright/test";
import {
  DOCK_GEAR_SLOT,
  dockSilhouettePath,
} from "@/features/overlay-controls/motion/dock-silhouette";
import { PILL_RADIUS } from "@/features/overlay-controls/motion/island-corners";

// The default placement docks the HUD to the right edge.
const sideDockUrl = "/src/overlay/index.html";

const actionNames = [
  "Start recording",
  "Open Echo chat",
  "Polish selected text",
] as const;

const actionBoxes = (page: Page) =>
  Promise.all(
    actionNames.map((name) => requiredBox(page.getByRole("button", { name })))
  );

const silhouetteOf = (locator: Locator) =>
  locator.evaluate((element) => getComputedStyle(element).clipPath);

const grabTheGrip = async (page: Page) => {
  const grip = page.getByRole("button", { name: "Move Echo control" });
  await page.locator(".echo-island-resident").hover();
  await grip.dispatchEvent("pointerdown", {
    button: 0,
    isPrimary: true,
    pointerType: "mouse",
  });
  await expect
    .poll(async () =>
      (await invokedCommands(page)).includes(
        "begin_recording_overlay_snap_preview"
      )
    )
    .toBe(true);
};

test("a side dock stacks round, separated actions across its full width", async ({
  page,
}) => {
  await page.goto(sideDockUrl);
  await expect(
    page.getByRole("button", { name: "Open Echo actions" })
  ).toHaveCount(0);
  const toolbar = page.getByRole("toolbar", { name: "Echo actions" });
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveAttribute("aria-orientation", "vertical");
  const morph = page.locator(".echo-island-morph");
  // attached to the edge: no ring, square on the screen side
  await expect(morph).toHaveCSS("box-shadow", "none");
  await expect(morph).toHaveCSS("border-top-right-radius", "0px");
  await expect(morph).toHaveCSS("border-bottom-right-radius", "0px");
  const grip = page.getByRole("button", { name: "Move Echo control" });
  await expect(grip).toHaveAttribute("data-live", "true");
  await expect(grip.locator("svg")).toBeVisible();
  await expect(grip.locator("svg")).toHaveCSS("rotate", "none");
  for (const name of actionNames) {
    const action = page.getByRole("button", { name });
    await expect(action).toHaveCSS("box-shadow", "none");
    // a resting fill separates neighbours before any hover
    await expect(action).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  }

  const panel = await requiredBox(page.locator(".echo-island-resident-panel"));
  const panelMiddle = panel.x + panel.width / 2;
  const boxes = await actionBoxes(page);
  for (const [index, box] of boxes.entries()) {
    expect(box.width, `${actionNames[index]} is round`).toBe(box.height);
    expect(box.width / panel.width).toBeGreaterThanOrEqual(0.75);
    expect(Math.abs(box.x + box.width / 2 - panelMiddle)).toBeLessThanOrEqual(
      0.5
    );
    const next = boxes[index + 1];
    if (next) {
      expect(next.y - (box.y + box.height)).toBeGreaterThan(0);
    }
  }
  const restingGrip = await requiredBox(grip);
  const lastAction = boxes.at(-1);
  if (!lastAction) {
    throw new Error("Side dock has no actions");
  }
  const contentMiddle = (restingGrip.y + lastAction.y + lastAction.height) / 2;
  expect(
    Math.abs(contentMiddle - (panel.y + panel.height / 2))
  ).toBeLessThanOrEqual(1);

  // The dock keeps one size: hovering it must not shift the icons being aimed at.
  const restingMorph = await requiredBox(morph);
  await grip.hover();
  await page.waitForTimeout(260);
  expect(await requiredBox(morph)).toEqual(restingMorph);
  expect(await requiredBox(grip)).toEqual(restingGrip);
  expect(await actionBoxes(page)).toEqual(boxes);
});

test("hovering a side dock grows the settings lobe; its gear opens Echo settings", async ({
  page,
}) => {
  await page.goto(sideDockUrl);
  await waitForTauriListener(page, "overlay-pointer");
  const morph = page.locator(".echo-island-morph");
  const gear = page.getByRole("button", {
    includeHidden: true,
    name: "Open Echo settings",
  });

  await pointNative(page, false);
  await expect(gear).toHaveAttribute("data-revealed", "false");
  await expect(gear).toHaveJSProperty("inert", true);
  const tucked = await silhouetteOf(morph);

  await pointNative(page, true);
  await expect(gear).toHaveAttribute("data-revealed", "true");
  await expect(gear).toHaveJSProperty("inert", false);
  await expect.poll(() => silhouetteOf(morph)).not.toBe(tucked);
  const panel = await requiredBox(page.locator(".echo-island-resident-panel"));
  expect((await requiredBox(gear)).y).toBeGreaterThanOrEqual(
    panel.y + panel.height
  );

  await gear.click();
  await expect
    .poll(() => invokedCommands(page))
    .toContain("open_settings_from_overlay");

  await pointNative(page, false);
  await expect(gear).toHaveAttribute("data-revealed", "false");
  await expect.poll(() => silhouetteOf(morph)).toBe(tucked);
});

test("a lifted island keeps the HUD's own face, minus the edge", async ({
  page,
}) => {
  await page.goto(sideDockUrl);
  const root = page.locator(".recording-overlay-root");
  const morph = page.locator(".echo-island-morph");
  await expect.poll(() => silhouetteOf(morph)).toContain("path");
  const face = () =>
    morph.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        boxShadow: style.boxShadow,
      };
    });
  const docked = await face();
  const frame = await morph.evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      throw new Error("Island morph is not an HTML element");
    }
    return { height: element.offsetHeight, width: element.offsetWidth };
  });

  await grabTheGrip(page);

  await expect(root).toHaveAttribute("data-dragging", "true");
  // shoulders melt into a pill instead of being switched off — a silhouette swap mid-drag would snap
  await expect
    .poll(() => silhouetteOf(morph))
    .toBe(
      dockSilhouettePath({
        anchor: "right",
        corner: PILL_RADIUS,
        gear: { revealed: false, slot: DOCK_GEAR_SLOT },
        height: frame.height,
        shoulder: 0,
        width: frame.width,
      })
    );
  // no drag ring: the lifted island is the same surface the user grabbed
  expect(await face()).toEqual(docked);
  await expect(
    page.getByRole("button", { name: "Move Echo control" })
  ).toBeVisible();
  const actions = page.locator(".echo-island-resident-actions");
  await expect(actions).toHaveJSProperty("inert", true);
  for (const item of await page.locator(".echo-island-action-item").all()) {
    await expect(item).toHaveCSS("opacity", "1");
  }
  await expect(page.locator(".echo-island-gear")).toHaveAttribute(
    "data-revealed",
    "false"
  );
});

test("the pointer release keeps the island lifted until Rust lands it", async ({
  page,
}) => {
  await page.goto(sideDockUrl);
  await waitForTauriListener(page, "overlay-drag-settled");
  await grabTheGrip(page);
  const root = page.locator(".recording-overlay-root");

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointerup"));
  });

  await expect
    .poll(async () =>
      (await invokedCommands(page)).includes(
        "snap_recording_overlay_to_nearest_edge"
      )
    )
    .toBe(true);
  // settling before the window lands would grow the shoulders mid-air
  await expect(root).toHaveAttribute("data-dragging", "true");
  await emitTauriEvent(page, "overlay-drag-settled", null);
  await expect(root).toHaveAttribute("data-dragging", "false");
});

interface Landing {
  anchor: string;
  windowY: number;
}

// Rust publishes the landed surface, then settles — sampled every frame in window space
const sampleLanding = (page: Page, landing: Landing) =>
  page.evaluate(async ({ anchor, windowY }) => {
    const morph = document.querySelector(".echo-island-morph");
    if (!(morph instanceof HTMLElement)) {
      throw new Error("Island morph is missing");
    }
    const read = () => {
      const box = morph.getBoundingClientRect();
      const xs = [
        ...getComputedStyle(morph).clipPath.matchAll(/(-?[\d.]+) -?[\d.]+/g),
      ].map((match) => Number(match[1]));
      return {
        center: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
        outline: (Math.max(...xs) - Math.min(...xs)) / morph.offsetWidth,
      };
    };
    const state = window.__ECHO_TEST_STATE__;
    state.overlayAnchor = anchor;
    const landed = state.buildOverlaySurface(state.overlayMode);
    const before = read();
    const samples = [before];
    window.__ECHO_TEST__.emit("overlay-surface", {
      ...(typeof landed === "object" ? landed : {}),
      window: { x: 0, y: windowY },
    });
    window.__ECHO_TEST__.emit("overlay-drag-settled", null);
    for (let frame = 0; frame < 20; frame += 1) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      samples.push(read());
    }
    return {
      drift: Math.max(
        ...samples.map(({ center }) =>
          Math.hypot(center.x - before.center.x, center.y - before.center.y)
        )
      ),
      narrowestOutline: Math.min(...samples.map(({ outline }) => outline)),
    };
  }, landing);

test("a drop lands with its window instead of replaying the trip", async ({
  page,
}) => {
  await page.goto(sideDockUrl);
  await waitForTauriListener(page, "overlay-drag-settled");
  await grabTheGrip(page);

  // the window was carried 300px up; the island must stay put inside it
  const { drift } = await sampleLanding(page, {
    anchor: "right",
    windowY: -300,
  });

  expect(drift).toBeLessThanOrEqual(1);
});

test("a drop on the far edge swaps the outline instead of squeezing it", async ({
  page,
}) => {
  await page.goto(sideDockUrl);
  await waitForTauriListener(page, "overlay-drag-settled");
  await grabTheGrip(page);

  const { narrowestOutline } = await sampleLanding(page, {
    anchor: "left",
    windowY: 0,
  });

  expect(narrowestOutline).toBeGreaterThan(0.9);
});

test("a native drop settles the drag the webview never saw end", async ({
  page,
}) => {
  await page.goto(sideDockUrl);
  await waitForTauriListener(page, "overlay-drag-settled");
  await grabTheGrip(page);
  const root = page.locator(".recording-overlay-root");
  await expect(root).toHaveAttribute("data-dragging", "true");

  await emitTauriEvent(page, "overlay-drag-settled", null);

  await expect(root).toHaveAttribute("data-dragging", "false");
  expect(
    (await invokedCommands(page)).includes(
      "snap_recording_overlay_to_nearest_edge"
    )
  ).toBe(false);
});
