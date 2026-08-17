import {
  emitTauriEvent,
  HUD_URL,
  invokedCommandPayloads,
  invokedCommands,
  NOTIFICATION_URL,
  requestNotificationSurface,
  setOverlayNotch,
  test,
  waitForTauriListener,
} from "@e2e/fixtures";
import { builtInMacBookProNotch } from "@e2e/overlay-chat/notch";
import { expect, type Locator, type Page } from "@playwright/test";

test("chat message selection stays on message text", async ({ page }) => {
  await page.setViewportSize({ height: 620, width: 800 });
  await page.goto(`${NOTIFICATION_URL}?polish=ready`);
  await waitForTauriListener(page, "overlay-notification-request");
  await requestNotificationSurface(page, "chat");
  await page.getByPlaceholder("Ask anything").fill("Hello");
  await page.getByRole("button", { name: "Send" }).click();

  const assistantText = page.locator(
    '[data-chat-role="assistant"] [data-component="chat-message-text"]'
  );
  await expect(assistantText).toHaveText("Echo 4B reply");
  const viewport = page.locator('[data-slot="scroll-area-viewport"]');
  const [textBox, viewportBox] = await Promise.all([
    assistantText.boundingBox(),
    viewport.boundingBox(),
  ]);
  if (!(textBox && viewportBox)) {
    throw new Error("Chat response did not render");
  }
  await page.mouse.move(textBox.x + 1, textBox.y + textBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    viewportBox.x + viewportBox.width - 2,
    viewportBox.y + viewportBox.height - 2,
    { steps: 8 }
  );
  await page.mouse.up();
  const selection = await page.evaluate(() => {
    const current = window.getSelection();
    if (!(current && current.rangeCount > 0)) {
      return null;
    }
    const rects = Array.from(current.getRangeAt(0).getClientRects());
    return {
      bottom: Math.max(...rects.map((rect) => rect.bottom)),
      text: current.toString(),
    };
  });
  expect(selection?.text).toContain("Echo 4B reply");
  expect(selection?.bottom).toBeLessThanOrEqual(textBox.y + textBox.height + 1);
});

const openCompactChat = async (page: Page) => {
  await page.setViewportSize({ height: 620, width: 360 });
  await page.goto(`${NOTIFICATION_URL}?polish=ready`);
  await setOverlayNotch(page, builtInMacBookProNotch);
  await waitForTauriListener(page, "overlay-notification-request");
  await waitForTauriListener(page, "overlay-chat-context");
  await requestNotificationSurface(page, "chat");
  await emitTauriEvent(page, "overlay-chat-context", {
    context: null,
    generation: 2,
    state: "loading",
  });
  const input = page.getByPlaceholder("Ask anything");
  await input.fill("What does this mean?");
  await expect(page.getByRole("status")).toHaveText("Checking selected text…");
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
};

const attachAndRefreshSelectedText = async (page: Page) => {
  const selectedText = `A selected passage with a long identifier ${"unbroken".repeat(80)}`;
  await emitTauriEvent(page, "overlay-chat-context", {
    context: { source: "selection", text: selectedText, truncated: true },
    generation: 2,
    state: "ready",
  });
  const reference = page.getByRole("group", {
    name: "Selected text context",
  });
  await expect(reference).toContainText("A selected passage");
  await expect(reference).toContainText("shortened");
  await expect(page.getByPlaceholder("Ask about this text")).toHaveValue(
    "What does this mean?"
  );
  await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
  const updatedText = "Selection changed after Chat opened";
  await emitTauriEvent(page, "overlay-chat-context", {
    context: { source: "selection", text: updatedText, truncated: false },
    generation: 2,
    state: "ready",
  });
  await expect(reference).toContainText(updatedText);
  await expect(reference).not.toContainText("A selected passage");
  return { reference, updatedText };
};

const assertCompactNotchLayout = async (page: Page, reference: Locator) => {
  expect(
    await page
      .locator(".echo-island-chat")
      .evaluate((element) => element.scrollWidth - element.clientWidth)
  ).toBeLessThanOrEqual(1);
  const morph = page.locator('[data-component="echo-island-morph"]');
  await expect(morph).toHaveAttribute("data-notch-bridge", "true");
  await expect(morph).toHaveCSS("border-top-left-radius", "0px");
  await expect(morph).toHaveCSS("border-top-right-radius", "0px");
  await expect
    .poll(
      async () => (await morph.boundingBox())?.y ?? Number.POSITIVE_INFINITY
    )
    .toBeLessThanOrEqual(0.5);
  expect(
    await reference.evaluate(
      (element) => element.scrollWidth - element.clientWidth
    )
  ).toBeLessThanOrEqual(1);
};

const sendCompactChat = async (
  page: Page,
  reference: Locator,
  updatedText: string
) => {
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Echo 4B reply")).toBeVisible();
  const composer = page.getByPlaceholder("Ask about this text");
  await expect
    .poll(async () => {
      const [composerBox, islandBox] = await Promise.all([
        composer.boundingBox(),
        page.locator(".echo-island").boundingBox(),
      ]);
      if (!(composerBox && islandBox)) {
        return Number.POSITIVE_INFINITY;
      }
      return (
        composerBox.y + composerBox.height - (islandBox.y + islandBox.height)
      );
    })
    .toBeLessThanOrEqual(0);
  await expect
    .poll(() => invokedCommands(page))
    .toContain("chat_with_polish_model");
  await expect(reference).toBeVisible();
  await expect(reference).toContainText(updatedText);
  await expect(
    page.getByRole("button", { name: "Remove selected text" })
  ).toHaveCount(0);
};

test("chat attaches selected text without overflowing its compact window", async ({
  page,
}) => {
  await openCompactChat(page);
  const { reference, updatedText } = await attachAndRefreshSelectedText(page);
  await assertCompactNotchLayout(page, reference);
  await sendCompactChat(page, reference, updatedText);
});

test("chat sends the selected reference and complete recent thread", async ({
  page,
}) => {
  const selectedText = "Damn, how despicable";
  await page.goto(
    `${NOTIFICATION_URL}?polish=ready&notificationRequest=chat&selectedContext=${encodeURIComponent(selectedText)}`
  );
  const input = page.getByPlaceholder("Ask about this text");

  await input.fill("What does this mean?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Echo 4B reply")).toHaveCount(1);

  await input.fill("In French");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Echo 4B reply")).toHaveCount(2);

  const payloads = await invokedCommandPayloads(page, "chat_with_polish_model");
  expect(payloads).toHaveLength(2);
  expect(payloads[1]).toContain(selectedText);
  expect(payloads[1]).toContain('"content":"What does this mean?"');
  expect(payloads[1]).toContain('"content":"Echo 4B reply"');
  expect(payloads[1]).toContain('"content":"In French"');
});

test("a late chat surface event keeps selected terminal text attached", async ({
  page,
}) => {
  await page.goto(`${NOTIFICATION_URL}?polish=ready`);
  await waitForTauriListener(page, "overlay-notification-request");
  await waitForTauriListener(page, "overlay-chat-context");
  await emitTauriEvent(page, "overlay-chat-context", {
    context: {
      source: "selection",
      text: "$ bun test\n31 pass\n0 fail",
      truncated: false,
    },
    generation: 1,
    state: "ready",
  });
  await emitTauriEvent(page, "overlay-chat-context", {
    context: null,
    generation: 1,
    state: "loading",
  });
  await requestNotificationSurface(page, "chat");

  await expect(
    page.getByRole("group", { name: "Selected text context" })
  ).toContainText("$ bun test");
});

test("the HUD hands chat and Polish to the notification window", async ({
  page,
}) => {
  await page.goto(`${HUD_URL}?polish=not_downloaded`);
  await page.getByRole("button", { name: "Open Echo chat" }).click();

  await expect
    .poll(() => invokedCommands(page))
    .toContain("request_overlay_notification");
  // The HUD draws neither of them: it folds back into its handle.
  await expect(page.getByPlaceholder("Ask anything")).toBeHidden();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("closing chat reveals a background download instead of dismissing it", async ({
  page,
}) => {
  await page.goto(`${NOTIFICATION_URL}?polish=ready`);
  await waitForTauriListener(page, "model-download-progress");
  await waitForTauriListener(page, "overlay-notification-request");
  await requestNotificationSurface(page, "chat");
  await emitTauriEvent(page, "model-download-progress", {
    downloaded: 249_728_045,
    model_id: "polish-qwen3-4b-instruct-2507",
    percentage: 10,
    total: 2_497_280_448,
  });

  await page.getByRole("button", { name: "Close chat" }).click();
  await page.mouse.move(0, 0);

  await expect(page.getByText("Downloading Polish… 10%")).toBeVisible();
});
