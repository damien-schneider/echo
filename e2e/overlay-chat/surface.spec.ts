import {
  emitTauriEvent,
  invokedCommands,
  NOTIFICATION_URL,
  requestNotificationSurface,
  setOverlayNotch,
  test,
  waitForTauriListener,
} from "@e2e/fixtures";
import { builtInMacBookProNotch } from "@e2e/overlay-chat/notch";
import { expect, type Locator, type Page } from "@playwright/test";

test("chat opens passively and accepts focus only after an input click", async ({
  page,
}) => {
  await page.goto(`${NOTIFICATION_URL}?polish=ready`);
  await waitForTauriListener(page, "overlay-notification-request");
  await requestNotificationSurface(page, "chat");
  const chatInput = page.getByPlaceholder("Ask anything");
  await expect(chatInput).toBeVisible();
  await expect(chatInput).not.toBeFocused();

  await chatInput.click();
  await expect(chatInput).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(page.getByPlaceholder("Ask anything")).toBeHidden();
});

test("chat restores an early request with model loading inside its window", async ({
  page,
}) => {
  await page.goto(
    `${NOTIFICATION_URL}?polish=loading&notificationRequest=chat`
  );

  await expect(page.getByPlaceholder("Ask anything")).toBeVisible();
  await expect(page.getByText("Loading Qwen3 4B…")).toBeVisible();
  await expect
    .poll(() => invokedCommands(page))
    .toContain("get_overlay_notification_request");
});

test("chat runs on Qwen3 4B and offers its download inline", async ({
  page,
}) => {
  await page.goto(`${NOTIFICATION_URL}?polish=not_downloaded`);
  await waitForTauriListener(page, "overlay-notification-request");
  await requestNotificationSurface(page, "chat");

  await expect(page.getByText("Qwen3 4B", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: "Cloud" })
      .or(page.getByRole("combobox", { name: "Provider and model" }))
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Download Qwen3 4B model, 2.5 GB" })
    .click();
  await expect
    .poll(() => invokedCommands(page))
    .toContain("download_polish_model");
  await expect(page.getByText("Downloading Qwen3 4B · 0%")).toBeVisible();
});

test("chat repair reports its reason and visibly starts recovery", async ({
  page,
}) => {
  await page.goto(`${NOTIFICATION_URL}?polish=repair`);
  await waitForTauriListener(page, "polish-status-changed");
  await waitForTauriListener(page, "overlay-notification-request");
  await requestNotificationSurface(page, "chat");
  await emitTauriEvent(page, "polish-status-changed", {
    message:
      "The local Polish service could not start. Restart Echo, then choose Repair.",
    state: "repair",
  });

  await expect(page.getByRole("alert")).toContainText(
    "The local Polish service could not start"
  );
  await page.getByRole("button", { name: "Repair Qwen3 4B model" }).click();
  await expect(page.getByText("Checking Qwen3 4B…")).toBeVisible();
  await expect
    .poll(() => invokedCommands(page))
    .toContain("repair_polish_model");
});

test("chat always shows an empty selected-text preview", async ({ page }) => {
  await page.goto(`${NOTIFICATION_URL}?polish=ready`);
  await waitForTauriListener(page, "overlay-notification-request");
  await waitForTauriListener(page, "overlay-chat-context");
  await requestNotificationSurface(page, "chat");
  await emitTauriEvent(page, "overlay-chat-context", {
    context: null,
    generation: 1,
    state: "ready",
  });

  const reference = page.getByRole("group", {
    name: "Selected text context",
  });
  await expect(reference).toBeVisible();
  await expect(reference).toContainText("No text selected");
  await expect(page.getByPlaceholder("Ask anything")).toBeVisible();
});

test("chat recovers selected text captured before its listeners mount", async ({
  page,
}) => {
  const selectedText = "Selection captured while the Chat window was loading";
  await page.goto(
    `${NOTIFICATION_URL}?polish=ready&notificationRequest=chat&selectedContext=${encodeURIComponent(selectedText)}`
  );

  const reference = page.getByRole("group", {
    name: "Selected text context",
  });
  await expect(reference).toContainText(selectedText);
  await expect
    .poll(() => invokedCommands(page))
    .toContain("get_overlay_chat_context");
});

test("chat exposes missing Accessibility access beside the preview", async ({
  page,
}) => {
  await page.goto(`${NOTIFICATION_URL}?polish=ready`);
  await waitForTauriListener(page, "overlay-notification-request");
  await waitForTauriListener(page, "overlay-chat-context");
  await requestNotificationSurface(page, "chat");
  await emitTauriEvent(page, "overlay-chat-context", {
    context: null,
    generation: 1,
    state: "permission_required",
  });

  const reference = page.getByRole("group", {
    name: "Selected text context",
  });
  await expect(reference).toContainText("Accessibility access needed");
  await page.getByRole("button", { name: "Allow" }).click();
  await expect
    .poll(() => invokedCommands(page))
    .toContain("plugin:macos-permissions|request_accessibility_permission");
  await expect
    .poll(() => invokedCommands(page))
    .toContain("refresh_overlay_chat_context");
});

const requiredBox = async (locator: Locator, label: string) => {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error(`${label} did not render`);
  }
  return box;
};

const openNotchedChat = async (page: Page) => {
  await page.setViewportSize({ height: 620, width: 800 });
  await page.goto(`${NOTIFICATION_URL}?polish=ready`);
  await setOverlayNotch(page, builtInMacBookProNotch);
  await waitForTauriListener(page, "overlay-notification-request");
  await requestNotificationSurface(page, "chat");
  const morph = page.locator('[data-component="echo-island-morph"]');
  const hud = page.locator('[data-component="island-hud"][data-layout="chat"]');
  await expect(morph).toHaveAttribute("data-notch-bridge", "true");
  await expect(hud).toHaveAttribute("data-flanked", "true");
  await expect
    .poll(async () => (await morph.boundingBox())?.width ?? 0)
    .toBeGreaterThanOrEqual(670);
};

const assertNotchFlankGeometry = async (page: Page) => {
  const morph = page.locator('[data-component="echo-island-morph"]');
  const hud = page.locator('[data-component="island-hud"][data-layout="chat"]');
  const body = hud.locator(':scope > [data-component="island-hud-body"]');
  const left = hud.locator(':scope > .echo-island-hud-flank[data-side="left"]');
  const right = hud.locator(
    ':scope > .echo-island-hud-flank[data-side="right"]'
  );
  const reference = page.getByRole("group", {
    name: "Selected text context",
  });
  const [bodyBox, leftBox, morphBox, referenceBox, rightBox] =
    await Promise.all([
      requiredBox(body, "Chat body"),
      requiredBox(left, "Left Chat flank"),
      requiredBox(morph, "Chat shell"),
      requiredBox(reference, "Chat reference"),
      requiredBox(right, "Right Chat flank"),
    ]);
  const viewportWidth = page.viewportSize()?.width;
  if (viewportWidth === undefined) {
    throw new Error("Chat viewport was unavailable");
  }
  const notchLeft = viewportWidth / 2 - builtInMacBookProNotch.width / 2;
  const notchRight = notchLeft + builtInMacBookProNotch.width;
  expect(leftBox.y).toBeCloseTo(morphBox.y, 0);
  expect(rightBox.y).toBeCloseTo(morphBox.y, 0);
  expect(leftBox.y + leftBox.height).toBeLessThanOrEqual(bodyBox.y);
  expect(rightBox.y + rightBox.height).toBeLessThanOrEqual(bodyBox.y);
  expect(leftBox.x + leftBox.width).toBeLessThanOrEqual(notchLeft + 0.5);
  expect(rightBox.x).toBeGreaterThanOrEqual(notchRight - 0.5);
  expect(referenceBox.y).toBeGreaterThanOrEqual(bodyBox.y);
  expect(referenceBox.y).toBeGreaterThanOrEqual(
    morphBox.y + builtInMacBookProNotch.topInset
  );
};

const assertChatEdgeInsets = async (page: Page) => {
  const edgeInset = 12;
  const morph = page.locator('[data-component="echo-island-morph"]');
  const hud = page.locator('[data-component="island-hud"][data-layout="chat"]');
  const leftToolbar = hud.locator(
    ':scope > .echo-island-hud-flank[data-side="left"] > *'
  );
  const rightToolbar = hud.locator(
    ':scope > .echo-island-hud-flank[data-side="right"] > *'
  );
  const composer = page
    .getByPlaceholder("Ask anything")
    .locator("xpath=ancestor::form");
  const [composerBox, leftToolbarBox, morphBox, rightToolbarBox] =
    await Promise.all([
      requiredBox(composer, "Chat composer"),
      requiredBox(leftToolbar, "Left Chat toolbar"),
      requiredBox(morph, "Chat shell"),
      requiredBox(rightToolbar, "Right Chat toolbar"),
    ]);
  expect(leftToolbarBox.x).toBeCloseTo(morphBox.x + edgeInset, 0);
  const rightToolbarEdge = rightToolbarBox.x + rightToolbarBox.width;
  const morphRightEdge = morphBox.x + morphBox.width;
  expect(rightToolbarEdge).toBeCloseTo(morphRightEdge - edgeInset, 0);
  const composerBottom = composerBox.y + composerBox.height;
  const morphBottom = morphBox.y + morphBox.height;
  expect(composerBottom).toBeCloseTo(morphBottom - edgeInset, 0);
};

const assertNotchControlsInteractive = async (page: Page) => {
  const hud = page.locator('[data-component="island-hud"][data-layout="chat"]');
  await expect(
    hud
      .locator(':scope > .echo-island-hud-flank[data-side="left"]')
      .getByText("Qwen3 4B", { exact: true })
  ).toBeVisible();
  const closeButton = hud
    .locator(':scope > .echo-island-hud-flank[data-side="right"]')
    .getByRole("button", { name: "Close chat" });
  const closeBox = await requiredBox(closeButton, "Close chat");
  const controlAtItsCenter = await page.evaluate(
    ({ x, y }) =>
      document
        .elementFromPoint(x, y)
        ?.closest("button")
        ?.getAttribute("aria-label") ?? null,
    { x: closeBox.x + closeBox.width / 2, y: closeBox.y + closeBox.height / 2 }
  );
  expect(controlAtItsCenter).toBe("Close chat");
};

test("chat toolbar occupies the notch flanks", async ({ page }) => {
  await openNotchedChat(page);
  await assertNotchFlankGeometry(page);
  await assertChatEdgeInsets(page);
  await assertNotchControlsInteractive(page);
});
