import {
  emitTauriEvent,
  invokedCommands,
  NOTIFICATION_URL,
  test,
  waitForTauriListener,
} from "@e2e/fixtures";
import { expect, type Page } from "@playwright/test";

const defaultOverlayUrl = "/src/overlay/index.html";
const overlayUrl = `${defaultOverlayUrl}?overlayPlacement=bottom`;
const readyOverlayUrl = `${overlayUrl}&polish=ready`;

interface ActionBox {
  height: number;
  width: number;
  x: number;
  y: number;
}

test("keeps side-docked actions visible in a compact vertical toolbar", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(defaultOverlayUrl);

  await expect(
    page.getByRole("button", { name: "Open Echo actions" })
  ).toHaveCount(0);
  const toolbar = page.getByRole("toolbar", { name: "Echo actions" });
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveAttribute("aria-orientation", "vertical");
  const resident = page.locator(".echo-island-resident");
  await expect(resident).toHaveCSS("width", "32px");
  await expect(resident).toHaveCSS("height", "104px");

  const actions = [
    page.getByRole("button", { name: "Start recording" }),
    page.getByRole("button", { name: "Open Echo chat" }),
    page.getByRole("button", { name: "Polish selected text" }),
  ];
  const boxes: Array<ActionBox | null> = [];
  for (const action of actions) {
    await expect(action).toBeVisible();
    await expect(action).toHaveCSS("width", "20px");
    await expect(action).toHaveCSS("height", "20px");
    await expect(action).toHaveCSS("border-radius", "6px");
    await expect(action.locator("svg")).toHaveCSS("width", "12px");
    await expect(action).toHaveCSS("box-shadow", "none");
    boxes.push(await action.boundingBox());
  }
  expect(boxes.every((box) => box !== null)).toBe(true);
  expect(boxes[0]?.x).toBe(boxes[1]?.x);
  expect(boxes[1]?.x).toBe(boxes[2]?.x);
  expect((boxes[1]?.y ?? 0) - (boxes[0]?.y ?? 0)).toBeGreaterThan(20);
  expect((boxes[2]?.y ?? 0) - (boxes[1]?.y ?? 0)).toBeGreaterThan(20);
  const morph = page.locator(".echo-island-morph");
  await expect(morph).toHaveCSS("width", "32px");
  await expect(morph).toHaveCSS("height", "104px");
  const clipPath = await morph.evaluate(
    (element) => getComputedStyle(element).clipPath
  );
  expect(clipPath).toContain("C 32 5.523 27.523 10 22 10");
  await expect(morph).toHaveCSS("border-top-left-radius", "10px");
  await expect(morph).toHaveCSS("border-top-right-radius", "0px");
  await expect(morph).toHaveCSS("border-bottom-left-radius", "10px");
  await expect(morph).toHaveCSS("border-bottom-right-radius", "0px");
  const grip = page.getByRole("button", { name: "Move Echo control" });
  await expect(grip).toBeVisible();
  await expect(grip).toHaveCSS("opacity", "0.5");
  await expect(grip).toHaveCSS("pointer-events", "auto");
  await expect(grip).toHaveCSS("width", "20px");
  await expect(grip).toHaveCSS("height", "20px");
  await expect(grip).toHaveCSS("border-radius", "6px");
  await expect(grip.locator("svg")).toHaveCSS("width", "12px");
  await expect(grip.locator("svg")).toHaveCSS("height", "12px");
  await expect(grip.locator("svg")).toHaveCSS("rotate", "none");
  await expect(grip.locator("circle")).toHaveCount(6);
  const restingGrip = await grip.boundingBox();
  const residentBox = await resident.boundingBox();
  const lastActionBox = boxes.at(-1);
  if (!(residentBox && restingGrip && lastActionBox)) {
    throw new Error("Resident content geometry is unavailable");
  }
  expect(restingGrip.x).toBe(boxes[0]?.x);
  const contentCenter =
    (restingGrip.y + lastActionBox.y + lastActionBox.height) / 2;
  const residentCenter = residentBox.y + residentBox.height / 2;
  expect(
    Math.abs(contentCenter - residentCenter),
    JSON.stringify({ contentCenter, lastActionBox, residentBox, restingGrip })
  ).toBeLessThanOrEqual(1);

  // The bar keeps one size: hovering it must not shift the icons being aimed at.
  await grip.hover();
  await page.waitForTimeout(260);
  await expect(resident).toHaveCSS("width", "32px");
  await expect(resident).toHaveCSS("height", "104px");
  await expect(morph).toHaveCSS("width", "32px");
  await expect(morph).toHaveCSS("height", "104px");
  await expect
    .poll(() => morph.evaluate((element) => getComputedStyle(element).clipPath))
    .toContain("C 32 5.523 27.523 10 22 10");
  expect(await grip.boundingBox()).toEqual(restingGrip);
  const hoveredBoxes: Array<ActionBox | null> = [];
  for (const action of actions) {
    hoveredBoxes.push(await action.boundingBox());
  }
  expect(hoveredBoxes).toEqual(boxes);
});

test("native hover crossings leave the side dock exactly where it was", async ({
  page,
}) => {
  await page.goto(defaultOverlayUrl);
  await waitForTauriListener(page, "overlay-pointer-boundary");
  const resident = page.locator(".echo-island-resident");
  const morph = page.locator(".echo-island-morph");
  const record = page.getByRole("button", { name: "Start recording" });
  const geometry = () =>
    page.evaluate(() => {
      const island = document.querySelector<HTMLElement>(".echo-island-morph");
      const action = document.querySelector<HTMLElement>(".echo-island-action");
      if (!(island && action)) {
        throw new Error("Side resident geometry is unavailable");
      }
      const islandBox = island.getBoundingClientRect();
      const actionBox = action.getBoundingClientRect();
      return {
        edgeGap: innerWidth - islandBox.right,
        rightInset: islandBox.right - actionBox.right,
        width: islandBox.width,
      };
    });

  await emitTauriEvent(page, "overlay-pointer-boundary", false);
  await expect(resident).toHaveAttribute("data-active", "false");
  await expect(morph).toHaveCSS("width", "32px");
  await page.waitForTimeout(260);
  const idle = await geometry();

  await resident.hover();
  await emitTauriEvent(page, "overlay-pointer-boundary", true);
  await expect(resident).toHaveAttribute("data-active", "true");
  await expect(morph).toHaveCSS("width", "32px");
  await page.waitForTimeout(260);
  const active = await geometry();

  await record.focus();
  await record.dispatchEvent("pointerdown", {
    button: 0,
    isPrimary: true,
    pointerType: "mouse",
  });
  await emitTauriEvent(page, "overlay-pointer-boundary", false);
  await expect(resident).toHaveAttribute("data-active", "false");
  await expect(morph).toHaveCSS("width", "32px");
  await page.waitForTimeout(260);
  const released = await geometry();

  expect([idle.edgeGap, active.edgeGap, released.edgeGap]).toEqual([0, 0, 0]);
  expect(Math.round(idle.width)).toBe(32);
  expect(active).toEqual(idle);
  expect(released).toEqual(idle);
});

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

test("a lifted island drops its docked silhouette for a clean handle", async ({
  page,
}) => {
  await page.goto(defaultOverlayUrl);
  const root = page.locator(".recording-overlay-root");
  const morph = page.locator(".echo-island-morph");
  await expect
    .poll(() => morph.evaluate((element) => getComputedStyle(element).clipPath))
    .toContain("path");

  await grabTheGrip(page);

  await expect(root).toHaveAttribute("data-dragging", "true");
  await expect
    .poll(() => morph.evaluate((element) => getComputedStyle(element).clipPath))
    .toBe("none");
  await expect(morph).toHaveCSS("border-top-right-radius", "10px");
  await expect(morph).toHaveCSS("border-bottom-right-radius", "10px");
  await expect(
    page.getByRole("button", { name: "Move Echo control" })
  ).toBeVisible();
});

test("the pointer release asks Rust to settle the drag", async ({ page }) => {
  await page.goto(defaultOverlayUrl);
  await grabTheGrip(page);

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
  await expect(page.locator(".recording-overlay-root")).toHaveAttribute(
    "data-dragging",
    "false"
  );
});

test("a native drop settles the drag the webview never saw end", async ({
  page,
}) => {
  await page.goto(defaultOverlayUrl);
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

test("rests as a subtle handle and reveals all actions on hover", async ({
  page,
}) => {
  await page.goto(overlayUrl);

  const handle = page.getByRole("button", { name: "Open Echo actions" });
  await expect(handle).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start recording" })
  ).toBeHidden();
  await handle.hover();

  await expect(
    page.getByRole("toolbar", { name: "Echo actions" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start recording" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open Echo chat" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Polish selected text" })
  ).toBeVisible();
});

test("only the visible compact bar reveals the actions", async ({ page }) => {
  await page.goto(overlayUrl);

  const handle = page.getByRole("button", { name: "Open Echo actions" });
  const morph = page.locator('[data-component="echo-island-morph"]');
  const handleBox = await handle.boundingBox();
  const morphBox = await morph.boundingBox();

  expect(handleBox).not.toBeNull();
  expect(morphBox).not.toBeNull();
  expect(handleBox?.width).toBe(38);
  expect(handleBox?.height).toBe(5);
  expect(morphBox?.width).toBe(38);
  expect(morphBox?.height).toBe(5);
  if (!handleBox) {
    return;
  }

  await page.mouse.move(handleBox.x - 3, handleBox.y + handleBox.height / 2);
  await page.waitForTimeout(80);
  await expect(
    page.getByRole("toolbar", { name: "Echo actions" })
  ).toBeHidden();

  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2
  );
  await expect(
    page.getByRole("toolbar", { name: "Echo actions" })
  ).toBeVisible();
});

test("survives repeated hover cycles without a stale open or close", async ({
  page,
}) => {
  await page.goto(overlayUrl);

  const handle = page.getByRole("button", { name: "Open Echo actions" });
  const toolbar = page.getByRole("toolbar", { name: "Echo actions" });

  for (let cycle = 0; cycle < 12; cycle += 1) {
    const handleBox = await handle.boundingBox();
    expect(handleBox).not.toBeNull();
    if (!handleBox) {
      return;
    }
    expect(handleBox.width).toBe(38);
    expect(handleBox.height).toBe(5);
    await page.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2
    );
    await expect(
      toolbar,
      `cycle ${cycle + 1} should open from ${JSON.stringify(handleBox)}`
    ).toBeVisible({ timeout: 150 });
    await page.mouse.move(0, 0);
    await expect(handle).toBeVisible({ timeout: 350 });
    await expect(toolbar).toBeHidden();
    await expect(handle).toHaveCSS("width", "38px");
    await expect(handle).toHaveCSS("height", "5px");
  }
});

test("the full visible action container owns hover after expansion", async ({
  page,
}) => {
  await page.goto(overlayUrl);

  await page.getByRole("button", { name: "Open Echo actions" }).hover();
  const resident = page.locator(".echo-island-resident");
  const toolbar = page.getByRole("toolbar", { name: "Echo actions" });
  await expect(resident).toHaveCSS("width", "128px");
  await expect(resident).toHaveCSS("height", "40px");

  await resident.hover({ position: { x: 1, y: 1 } });
  await page.waitForTimeout(250);

  await expect(toolbar).toBeVisible();
  const residentBox = await resident.boundingBox();
  if (!residentBox) {
    return;
  }
  await page.mouse.move(residentBox.x - 2, residentBox.y + 1);
  await expect(
    page.getByRole("button", { name: "Open Echo actions" })
  ).toBeVisible({ timeout: 350 });
});

test("settles back to the exact compact target before the next hover", async ({
  page,
}) => {
  await page.goto(overlayUrl);

  const handle = page.getByRole("button", { name: "Open Echo actions" });
  await handle.hover();
  await expect(
    page.getByRole("toolbar", { name: "Echo actions" })
  ).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(handle).toBeVisible({ timeout: 350 });

  await expect
    .poll(async () => {
      const box = await handle.boundingBox();
      return box ? [Math.round(box.width), Math.round(box.height)] : null;
    })
    .toEqual([38, 5]);

  const settledBox = await handle.boundingBox();
  if (!settledBox) {
    return;
  }
  await page.mouse.move(settledBox.x - 3, settledBox.y + settledBox.height / 2);
  await page.waitForTimeout(80);
  await expect(
    page.getByRole("toolbar", { name: "Echo actions" })
  ).toBeHidden();
});

test("native pointer boundary reverses a connected resident morph", async ({
  page,
}) => {
  // macOS sends no DOM pointer events until the panel is key — Rust emits the boundary instead
  await page.goto(overlayUrl);
  await waitForTauriListener(page, "overlay-pointer-boundary");
  const morph = page.locator('[data-component="echo-island-morph"]');
  const toolbar = page.getByRole("toolbar", { name: "Echo actions" });

  await emitTauriEvent(page, "overlay-pointer-boundary", true);
  await expect(toolbar).toBeVisible();
  await expect(morph).toHaveCSS("width", "128px");
  await expect(morph).toHaveCSS("height", "40px");

  const trajectory = await page.evaluate(async () => {
    const island = document.querySelector<HTMLElement>(
      '[data-component="echo-island-morph"]'
    );
    const root = document.querySelector<HTMLElement>(".recording-overlay-root");
    if (!(island && root?.dataset.anchor)) {
      throw new Error("Resident island geometry is unavailable");
    }
    interface MorphFrame {
      centerGap: number;
      connected: boolean;
      edgeGap: number;
      height: number;
      width: number;
    }
    const readFrame = (): MorphFrame => {
      const bounds = island.getBoundingClientRect();
      const anchor = root.dataset.anchor;
      const sideAnchor = anchor === "left" || anchor === "right";
      let edgeGap = bounds.top;
      if (anchor === "bottom") {
        edgeGap = innerHeight - bounds.bottom;
      } else if (anchor === "right") {
        edgeGap = innerWidth - bounds.right;
      } else if (anchor === "left") {
        edgeGap = bounds.left;
      }
      return {
        centerGap: sideAnchor
          ? bounds.top + bounds.height / 2 - innerHeight / 2
          : bounds.left + bounds.width / 2 - innerWidth / 2,
        connected: island.isConnected,
        edgeGap,
        height: bounds.height,
        width: bounds.width,
      };
    };
    const samples: MorphFrame[] = [];
    const captureFrames = async (count: number) => {
      for (let frame = 0; frame < count; frame += 1) {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
        samples.push(readFrame());
      }
    };

    window.__ECHO_TEST__.emit("overlay-pointer-boundary", false);
    await captureFrames(60);
    const collapsed = readFrame();

    window.__ECHO_TEST__.emit("overlay-pointer-boundary", true);
    await captureFrames(60);
    const expanded = readFrame();

    window.__ECHO_TEST__.emit("overlay-pointer-boundary", false);
    await captureFrames(4);
    const closingPhase = document.querySelector<HTMLElement>(
      ".echo-island-handle-hitbox"
    )?.dataset.motion;
    window.__ECHO_TEST__.emit("overlay-pointer-boundary", true);
    await captureFrames(60);

    return {
      closingPhase,
      collapsed,
      expanded,
      reversed: readFrame(),
      samples,
    };
  });

  expect([
    Math.round(trajectory.collapsed.width),
    Math.round(trajectory.collapsed.height),
  ]).toEqual([38, 5]);
  expect([
    Math.round(trajectory.expanded.width),
    Math.round(trajectory.expanded.height),
  ]).toEqual([128, 40]);
  expect(trajectory.closingPhase).toBe("closing");
  expect([
    Math.round(trajectory.reversed.width),
    Math.round(trajectory.reversed.height),
  ]).toEqual([128, 40]);
  expect(
    trajectory.samples.every(
      ({ connected, height, width }) =>
        connected &&
        Number.isFinite(width) &&
        width > 0 &&
        Number.isFinite(height) &&
        height > 0
    )
  ).toBe(true);
  expect(
    Math.max(...trajectory.samples.map(({ centerGap }) => Math.abs(centerGap)))
  ).toBeLessThanOrEqual(1);
  expect(
    Math.max(...trajectory.samples.map(({ edgeGap }) => Math.abs(edgeGap - 4)))
  ).toBeLessThanOrEqual(1);
  await expect(toolbar).toBeVisible();
});

test("a sustained hover keeps the controls open until the pointer leaves", async ({
  page,
}) => {
  await page.goto(overlayUrl);

  await page.getByRole("button", { name: "Open Echo actions" }).hover();
  const toolbar = page.getByRole("toolbar", { name: "Echo actions" });
  await expect(toolbar).toBeVisible();
  await toolbar.hover();
  await page.waitForTimeout(650);

  await expect(toolbar).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(
    page.getByRole("button", { name: "Open Echo actions" })
  ).toBeVisible({ timeout: 350 });
});

test("reopens through the persistent hit target during exit", async ({
  page,
}) => {
  await page.goto(overlayUrl);

  await page.getByRole("button", { name: "Open Echo actions" }).hover();
  const toolbar = page.getByRole("toolbar", { name: "Echo actions" });
  const resident = page.locator(".echo-island-resident");
  await expect(toolbar).toBeVisible();
  const residentBox = await resident.boundingBox();
  expect(residentBox).not.toBeNull();
  if (!residentBox) {
    return;
  }

  await page.mouse.move(0, 0);
  const closingHandle = page.getByRole("button", { name: "Open Echo actions" });
  await expect(closingHandle).toHaveAttribute("data-motion", "closing");
  const closingBox = await closingHandle.boundingBox();
  expect(closingBox).not.toBeNull();
  if (!closingBox) {
    return;
  }
  const residentCenter = {
    x: residentBox.x + residentBox.width / 2,
    y: residentBox.y + residentBox.height / 2,
  };
  expect(closingBox.x).toBeLessThanOrEqual(residentCenter.x);
  expect(closingBox.x + closingBox.width).toBeGreaterThanOrEqual(
    residentCenter.x
  );
  expect(closingBox.y).toBeLessThanOrEqual(residentCenter.y);
  expect(closingBox.y + closingBox.height).toBeGreaterThanOrEqual(
    residentCenter.y
  );
  await closingHandle.hover({ position: { x: 1, y: 1 } });
  await page.waitForTimeout(220);

  await expect(toolbar).toBeVisible();
});

test("returns to the subtle handle after a sustained pointer leave", async ({
  page,
}) => {
  await page.goto(overlayUrl);

  await page.getByRole("button", { name: "Open Echo actions" }).hover();
  await expect(
    page.getByRole("toolbar", { name: "Echo actions" })
  ).toBeVisible();

  await page.mouse.move(0, 0);

  await expect(
    page.getByRole("button", { name: "Open Echo actions" })
  ).toBeVisible();
  await expect(
    page.getByRole("toolbar", { name: "Echo actions" })
  ).toBeHidden();
});

test("removes morph and stagger for reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(overlayUrl);

  await page.getByRole("button", { name: "Open Echo actions" }).hover();
  const shell = page.locator(".echo-island-resident-shell");
  const firstAction = page.getByRole("button", { name: "Start recording" });

  await expect(shell).toHaveCSS("transition-duration", "0s");
  await expect(firstAction).toHaveCSS("animation-name", "none");
});

test("moves keyboard focus into actions when the handle is activated", async ({
  page,
}) => {
  await page.goto(overlayUrl);

  const handle = page.getByRole("button", { name: "Open Echo actions" });
  await handle.focus();
  await page.keyboard.press("Enter");

  await expect(
    page.getByRole("button", { name: "Start recording" })
  ).toBeFocused();
});

test("pointer reveal does not move keyboard focus into HUD actions", async ({
  page,
}) => {
  await page.goto(overlayUrl);

  const handle = page.getByRole("button", { name: "Open Echo actions" });
  await handle.click();

  await expect(
    page.getByRole("button", { name: "Start recording" })
  ).not.toBeFocused();
});

test("ready Polish runs immediately without opening a focusable panel", async ({
  page,
}) => {
  await page.goto(readyOverlayUrl);
  await page.getByRole("button", { name: "Open Echo actions" }).hover();
  await page.getByRole("button", { name: "Polish selected text" }).click();

  await expect
    .poll(() => invokedCommands(page))
    .toContain("run_polish_from_overlay");
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("keeps the action island visible until Polish reports activity", async ({
  page,
}) => {
  await page.goto(readyOverlayUrl);
  await waitForTauriListener(page, "show-overlay");
  await page.getByRole("button", { name: "Open Echo actions" }).hover();
  const toolbar = page.getByRole("toolbar", { name: "Echo actions" });

  await page.getByRole("button", { name: "Polish selected text" }).click();

  await expect(toolbar).toBeVisible();
  await emitTauriEvent(page, "show-overlay", {
    message: "Polishing…",
    state: "processing",
  });
  // The HUD folds back into its handle so the notification has the stage.
  await expect(toolbar).toBeHidden();
});

test("morphs one shared island shell between the handle and its actions", async ({
  page,
}) => {
  await page.goto(readyOverlayUrl);
  await waitForTauriListener(page, "show-overlay");
  const morph = page.locator('[data-component="echo-island-morph"]');

  await expect(morph).toHaveAttribute("data-mode", "compact");
  await page.getByRole("button", { name: "Open Echo actions" }).hover();
  await expect(morph).toHaveAttribute("data-mode", "actions");
  await expect(morph).toHaveCount(1);

  // Activity belongs to the other window: the HUD keeps its own two modes.
  await page.mouse.move(0, 0);
  await emitTauriEvent(page, "show-overlay", {
    message: "Polishing…",
    state: "processing",
  });
  await expect(morph).toHaveAttribute("data-mode", "compact");
  await expect(morph).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Echo activity" })).toHaveCount(
    0
  );
});

test("shows a quiet interior orbit only while Polish is processing", async ({
  page,
}) => {
  await page.goto(`${NOTIFICATION_URL}?polish=ready`);
  await waitForTauriListener(page, "show-overlay");

  await emitTauriEvent(page, "show-overlay", {
    message: "Polishing…",
    state: "processing",
  });

  const activity = page.getByRole("region", { name: "Echo activity" });
  await expect(activity).toHaveAttribute("aria-busy", "true");
  await expect(activity).toHaveText("Polishing…");
  await expect(page.locator(".echo-island-processing-orbit")).toBeVisible();
});

test("stops the Polish orbit when reduced motion is requested", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${NOTIFICATION_URL}?polish=ready`);
  await waitForTauriListener(page, "show-overlay");
  await emitTauriEvent(page, "show-overlay", {
    message: "Polishing…",
    state: "processing",
  });

  await expect(page.locator(".echo-island-processing-orbit")).toHaveCSS(
    "animation-name",
    "none"
  );
});
