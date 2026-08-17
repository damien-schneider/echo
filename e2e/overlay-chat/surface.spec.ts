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
  await expect(page.getByText("Loading Echo 4B…")).toBeVisible();
  await expect
    .poll(() => invokedCommands(page))
    .toContain("get_overlay_notification_request");
});

test("chat prioritizes Echo 4B and keeps provider setup accessible", async ({
  page,
}) => {
  await page.goto(`${NOTIFICATION_URL}?polish=not_downloaded`);
  await waitForTauriListener(page, "overlay-notification-request");
  await requestNotificationSurface(page, "chat");

  await expect(page.getByRole("combobox")).toContainText("Echo 4B");
  await expect(
    page.getByRole("button", { name: "Manage chat models" })
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Download Echo 4B model, 2.5 GB" })
    .click();
  await expect
    .poll(() => invokedCommands(page))
    .toContain("download_polish_model");
  await expect(page.getByText("Downloading Echo 4B · 0%")).toBeVisible();
  await page.getByRole("button", { name: "Cloud" }).click();
  const setupCloud = page.getByRole("button", {
    name: "Set up cloud chat model",
  });
  await expect(setupCloud).toBeEnabled();
  await setupCloud.click();

  await expect
    .poll(() => invokedCommands(page))
    .toContain("open_chat_model_settings");
  await expect(page.getByPlaceholder("Ask anything")).toBeHidden();
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
  await page.getByRole("button", { name: "Repair Echo 4B model" }).click();
  await expect(page.getByText("Checking Echo 4B…")).toBeVisible();
  await expect
    .poll(() => invokedCommands(page))
    .toContain("repair_polish_model");
});

test("chat model setup opens the Post Processing settings section", async ({
  page,
}) => {
  await page.goto("/");
  await waitForTauriListener(page, "open-settings-section");
  await emitTauriEvent(page, "open-settings-section", "post-processing");

  await expect(page.getByText("Enable Post Processing")).toBeVisible();
  await expect(page.getByText("Provider", { exact: true })).toBeVisible();
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
  const [localButtonBox, modelPickerBox] = await Promise.all([
    requiredBox(page.getByRole("button", { name: "Local" }), "Local mode"),
    requiredBox(
      page.getByRole("combobox", { name: "Provider and model" }),
      "Model picker"
    ),
  ]);
  const controlsAtTheirCenters = await page.evaluate(
    ({ leftX, leftY, rightX, rightY }) => {
      const labelAt = (x: number, y: number) => {
        const control = document.elementFromPoint(x, y)?.closest("button");
        return (
          control?.getAttribute("aria-label") ??
          control?.textContent?.trim() ??
          null
        );
      };
      return [labelAt(leftX, leftY), labelAt(rightX, rightY)];
    },
    {
      leftX: localButtonBox.x + localButtonBox.width / 2,
      leftY: localButtonBox.y + localButtonBox.height / 2,
      rightX: modelPickerBox.x + modelPickerBox.width / 2,
      rightY: modelPickerBox.y + modelPickerBox.height / 2,
    }
  );
  expect(controlsAtTheirCenters).toEqual(["Local", "Provider and model"]);
};

test("chat toolbar occupies the notch flanks", async ({ page }) => {
  await openNotchedChat(page);
  await assertNotchFlankGeometry(page);
  await assertChatEdgeInsets(page);
  await assertNotchControlsInteractive(page);
});
