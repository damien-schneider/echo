import {
  emitTauriEvent,
  invokedCommands,
  NOTIFICATION_URL,
  requestNotificationSurface,
  test,
  waitForTauriListener,
} from "@e2e/fixtures";
import { expect, type Page } from "@playwright/test";

const openChat = async (page: Page) => {
  await page.goto(`${NOTIFICATION_URL}?polish=ready`);
  await waitForTauriListener(page, "overlay-notification-request");
  await requestNotificationSurface(page, "chat");
};

const replaceChat = (page: Page) =>
  emitTauriEvent(page, "overlay-notification-request", {
    generation: 2,
    surface: "chat",
  });

test("keeps dictating when a newer chat replaces the one it started in", async ({
  page,
}) => {
  await openChat(page);
  await page.getByRole("button", { name: "Dictate a message" }).click();
  const stop = page.getByRole("button", { name: "Stop dictating" });
  await expect(stop).toHaveAttribute("aria-pressed", "true");

  await replaceChat(page);

  await expect(stop).toHaveAttribute("aria-pressed", "true");
  expect(await invokedCommands(page)).not.toContain("stop_chat_dictation");
});

test("releases the microphone when the chat closes mid-dictation", async ({
  page,
}) => {
  await openChat(page);
  await page.getByRole("button", { name: "Dictate a message" }).click();
  await expect(
    page.getByRole("button", { name: "Stop dictating" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Close chat" }).click();
  await expect
    .poll(() => invokedCommands(page))
    .toContain("stop_chat_dictation");
  await replaceChat(page);

  const dictate = page.getByRole("button", { name: "Dictate a message" });
  await expect(dictate).toBeEnabled();
  await expect(dictate).toHaveAttribute("aria-pressed", "false");
});

test("shows the words being heard in the message box until the transcript replaces them", async ({
  page,
}) => {
  await openChat(page);
  const message = page.getByRole("textbox", { name: "Message" });
  await message.fill("Summarize");
  await page.getByRole("button", { name: "Dictate a message" }).click();
  const stop = page.getByRole("button", { name: "Stop dictating" });
  await expect(stop).toBeVisible();

  await emitTauriEvent(page, "transcription-progress", "in two lines");
  await expect(message).toHaveValue("Summarize in two lines");
  await expect(message).toHaveAttribute("readonly", "");

  await stop.click();
  await expect(message).toHaveValue("Summarize in two lines");
  await page.evaluate(() => {
    window.__ECHO_TEST_STATE__.invokeDefaults.take_transcript_for_chat = {
      handover: "compose",
      text: "in two short lines",
    };
  });
  await emitTauriEvent(page, "overlay-chat-dictation", null);

  await expect(message).toHaveValue("Summarize in two short lines");
  await expect(message).not.toHaveAttribute("readonly");
});

const openPromptMenu = async (page: Page) => {
  await page.addInitScript(() => {
    window.__ECHO_TEST_STATE__.invokeDefaults.list_prompts = [
      {
        id: "summarize",
        instruction: "Summarize",
        locked: false,
        name: "Summarize",
      },
      {
        id: "translate",
        instruction: "Translate",
        locked: false,
        name: "Translate",
      },
    ];
  });
  await openChat(page);
  const pointerListeners = await page.evaluate(() =>
    window.__ECHO_TEST__.listenerCount("overlay-pointer")
  );
  await page.getByRole("button", { name: "Free chat" }).click();
  await waitForTauriListener(page, "overlay-pointer", pointerListeners + 1);
};

test("highlights the prompt under the pointer", async ({ page }) => {
  await openPromptMenu(page);
  const translate = page.getByRole("option", { name: "Translate" });

  await translate.hover();

  await expect(translate).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("option", { name: "Free chat" })).toHaveAttribute(
    "aria-selected",
    "false"
  );
});

test("leaves the highlight with the keyboard while the pointer rests on a prompt", async ({
  page,
}) => {
  await openPromptMenu(page);
  const translate = page.getByRole("option", { name: "Translate" });
  const resting = await translate.evaluate((option) => {
    const { height, width, x, y } = option.getBoundingClientRect();
    return { inside: true, x: x + width / 2, y: y + height / 2 };
  });

  await emitTauriEvent(page, "overlay-pointer", resting);
  await emitTauriEvent(page, "overlay-pointer", resting);

  await expect(page.getByRole("option", { name: "Free chat" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(translate).toHaveAttribute("aria-selected", "false");

  await emitTauriEvent(page, "overlay-pointer", {
    ...resting,
    x: resting.x + 4,
  });

  await expect(translate).toHaveAttribute("aria-selected", "true");
});
