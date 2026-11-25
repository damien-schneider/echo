import {
  emitTauriEvent,
  invokedCommands,
  NOTIFICATION_URL,
  test,
  waitForTauriListener,
} from "@e2e/fixtures";
import { expect } from "@playwright/test";

const overlayUrl = "/src/overlay/index.html?overlayPlacement=bottom";
const readyOverlayUrl = `${overlayUrl}&polish=ready`;

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

test("only the compact bar and the edge beneath it reveal the actions", async ({
  page,
}) => {
  await page.goto(overlayUrl);

  const handle = page.getByRole("button", { name: "Open Echo actions" });
  const morph = page.locator('[data-component="echo-island-morph"]');
  const handleBox = await handle.boundingBox();
  const morphBox = await morph.boundingBox();

  expect(handleBox).not.toBeNull();
  expect(morphBox).not.toBeNull();
  expect(handleBox?.width).toBe(48);
  expect(handleBox?.height).toBe(18);
  expect(morphBox?.width).toBe(48);
  expect(morphBox?.height).toBe(8);
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
    expect(handleBox.width).toBe(48);
    expect(handleBox.height).toBe(18);
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
    await expect(handle).toHaveCSS("width", "48px");
    await expect(handle).toHaveCSS("height", "18px");
  }
});

test("the full visible action container owns hover after expansion", async ({
  page,
}) => {
  await page.goto(overlayUrl);

  await page.getByRole("button", { name: "Open Echo actions" }).hover();
  const resident = page.locator(".echo-island-resident");
  const toolbar = page.getByRole("toolbar", { name: "Echo actions" });
  await expect(toolbar).toBeVisible();
  const restingBox = await resident.boundingBox();
  if (!restingBox) {
    throw new Error("Resident is not laid out");
  }

  // the pill's far end, off every action, still keeps the toolbar open
  await resident.hover({ position: { x: 2, y: restingBox.height / 2 } });
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
    .toEqual([48, 18]);

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
  await closingHandle.hover({ position: { x: closingBox.width / 2, y: 1 } });
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

test("lets light drift along the island only while Polish is processing", async ({
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
  await expect(page.locator(".echo-island-edge")).toHaveAttribute(
    "data-edge",
    "drift"
  );
});

test("holds the drifting light still when reduced motion is requested", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${NOTIFICATION_URL}?polish=ready`);
  await waitForTauriListener(page, "show-overlay");
  await emitTauriEvent(page, "show-overlay", {
    message: "Polishing…",
    state: "processing",
  });

  await expect(page.locator(".echo-island-edge-rim > span").first()).toHaveCSS(
    "animation-name",
    "none"
  );
});
