import {
  emitTauriEvent,
  holdChatReply,
  invokedCommandPayloads,
  invokedCommands,
  NOTIFICATION_URL,
  releaseChatReply,
  test,
  waitForTauriListener,
} from "@e2e/fixtures";
import { expect, type Page } from "@playwright/test";

const MARKDOWN_REPLY = [
  "## Result",
  "",
  "- **bold** item",
  "- a [link](https://example.com)",
  "",
  "```ts",
  "const answer = 42;",
  "const double = 2;",
  "```",
  "",
  "| Key | Value |",
  "| --- | ----- |",
  "| a   | 1     |",
].join("\n");

const chatUrl = (reply?: string) =>
  `${NOTIFICATION_URL}?polish=ready&notificationRequest=chat${
    reply ? `&chatReply=${encodeURIComponent(reply)}` : ""
  }`;

const THINKING_MODEL = {
  download_size_mb: 3428,
  id: "polish-gemma-4-e2b-it",
  name: "Gemma 4 E2B",
  supports_thinking: true,
  supports_voice_commands: false,
};

const FAST_MODEL = {
  download_size_mb: 2500,
  id: "polish-qwen3-4b-instruct-2507",
  name: "Qwen3 4B",
  supports_thinking: false,
  supports_voice_commands: true,
};

const publishReadyModel = (page: Page, model: typeof THINKING_MODEL) =>
  emitTauriEvent(page, "polish-status-changed", {
    message: "Ready",
    model,
    state: "ready",
  });

const chatPayloads = async (page: Page): Promise<unknown[]> =>
  (await invokedCommandPayloads(page, "chat_with_polish_model")).map(
    (payload): unknown => JSON.parse(payload)
  );

test("the prompt appears before the local model answers", async ({ page }) => {
  await page.goto(chatUrl());
  await holdChatReply(page);
  const input = page.getByPlaceholder("Ask anything");
  await input.fill("What is this?");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.locator('[data-chat-role="user"]')).toHaveText(
    "What is this?"
  );
  await expect(page.getByText("Answering…")).toBeVisible();
  await expect(input).toHaveValue("");

  await releaseChatReply(page);
  await expect(page.locator('[data-chat-role="assistant"]')).toContainText(
    "Qwen3 4B reply"
  );
});

test("Think stays on for later questions and Stop cancels a thinking answer", async ({
  page,
}) => {
  await page.goto(chatUrl());
  await waitForTauriListener(page, "polish-status-changed");
  await publishReadyModel(page, THINKING_MODEL);
  const think = page.getByRole("button", { exact: true, name: "Think" });
  await expect(think).toHaveAttribute("aria-pressed", "false");
  await think.focus();
  await page.keyboard.press("Space");
  await expect(think).toHaveAttribute("aria-pressed", "true");

  await holdChatReply(page);
  await page.getByPlaceholder("Ask anything").fill("Take your time");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Thinking…")).toBeVisible();
  await expect(think).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() => chatPayloads(page))
    .toEqual([
      expect.objectContaining({ modelId: THINKING_MODEL.id, thinking: true }),
    ]);
  const streamId = await streamIdOfPendingChat(page);

  await page.getByRole("button", { name: "Stop" }).click();

  await expect
    .poll(() => invokedCommandPayloads(page, "stop_polish_chat"))
    .toEqual([JSON.stringify({ streamId })]);
  await expect(page.getByText("Thinking…")).toBeHidden();
  await expect(page.locator('[data-chat-role="user"]')).toHaveText(
    "Take your time"
  );
  await expect(page.locator('[data-chat-role="assistant"]')).toHaveCount(0);
  await page.getByPlaceholder("Ask anything").fill("Look again");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Thinking…")).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).click();
  await think.click();
  await expect(think).toHaveAttribute("aria-pressed", "false");
  await page.getByPlaceholder("Ask anything").fill("Make it quick");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Answering…")).toBeVisible();
  await expect
    .poll(() => chatPayloads(page))
    .toEqual([
      expect.objectContaining({ modelId: THINKING_MODEL.id, thinking: true }),
      expect.objectContaining({ modelId: THINKING_MODEL.id, thinking: true }),
      expect.objectContaining({ modelId: THINKING_MODEL.id, thinking: false }),
    ]);
});

test("Chat hides Think on models without it and keeps the choice for models with it", async ({
  page,
}) => {
  await page.goto(chatUrl());
  await waitForTauriListener(page, "polish-status-changed");
  const think = page.getByRole("button", { exact: true, name: "Think" });
  await expect(think).toHaveCount(0);

  await publishReadyModel(page, THINKING_MODEL);
  await think.click();
  await publishReadyModel(page, {
    download_size_mb: 1561,
    id: "polish-minicpm5-2b",
    name: "MiniCPM5-2B",
    supports_thinking: true,
    supports_voice_commands: false,
  });
  await expect(think).toHaveAttribute("aria-pressed", "true");
  await publishReadyModel(page, FAST_MODEL);
  await expect(think).toHaveCount(0);

  await page.getByPlaceholder("Ask anything").fill("Use the selected model");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Qwen3 4B reply")).toBeVisible();
  const [payload] = await chatPayloads(page);
  expect(payload).toMatchObject({
    modelId: FAST_MODEL.id,
    thinking: false,
  });

  await publishReadyModel(page, THINKING_MODEL);
  await expect(think).toHaveAttribute("aria-pressed", "true");
});

test("Think also applies to dictated questions", async ({ page }) => {
  await page.goto(chatUrl());
  await waitForTauriListener(page, "polish-status-changed");
  await publishReadyModel(page, THINKING_MODEL);
  const think = page.getByRole("button", { exact: true, name: "Think" });
  await think.click();

  await page.getByRole("button", { name: "Dictate a message" }).click();
  await page.getByRole("button", { name: "Stop dictating" }).click();
  await page.evaluate(() => {
    window.__ECHO_TEST_STATE__.invokeDefaults.take_transcript_for_chat = {
      handover: "ask",
      text: "How does this work?",
    };
  });
  await emitTauriEvent(page, "overlay-chat-dictation", null);

  await expect(page.getByText("Qwen3 4B reply")).toBeVisible();
  const [payload] = await chatPayloads(page);
  expect(payload).toMatchObject({
    messages: [{ content: "How does this work?", role: "user" }],
    modelId: THINKING_MODEL.id,
    thinking: true,
  });
  await expect(think).toHaveAttribute("aria-pressed", "true");
});

test("automatic prompt runs stay Fast without using the next question's Think mode", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__ECHO_TEST_STATE__.invokeDefaults.list_prompts = [
      {
        id: "summarize",
        instruction: "Summarize the selected text.",
        locked: false,
        name: "Summarize",
      },
    ];
  });
  await page.goto(`${chatUrl()}&selectedContext=Text%20to%20summarize`);
  await waitForTauriListener(page, "polish-status-changed");
  await publishReadyModel(page, THINKING_MODEL);
  const think = page.getByRole("button", { exact: true, name: "Think" });
  await think.click();
  await page.getByRole("button", { name: "Free chat" }).click();
  await page.getByRole("option", { name: "Summarize" }).click();

  await expect(page.getByText("Qwen3 4B reply")).toBeVisible();
  const [payload] = await chatPayloads(page);
  expect(payload).toMatchObject({
    modelId: THINKING_MODEL.id,
    thinking: false,
  });
  await expect(think).toHaveAttribute("aria-pressed", "true");
});

test("the answer renders as markdown instead of raw syntax", async ({
  page,
}) => {
  await page.goto(chatUrl(MARKDOWN_REPLY));
  await page.getByPlaceholder("Ask anything").fill("Show me");
  await page.getByRole("button", { name: "Send" }).click();

  const answer = page.locator('[data-chat-role="assistant"]');
  await expect(answer.getByRole("heading", { name: "Result" })).toBeVisible();
  await expect(answer.locator('[data-streamdown="strong"]')).toHaveText("bold");
  await expect
    .poll(() => answer.locator("pre").innerText())
    .toBe("const answer = 42;\nconst double = 2;");
  await expect(answer.getByRole("table")).toBeVisible();
  await expect(answer).not.toContainText("**bold**");

  await answer.getByRole("link", { name: "link" }).click();
  await expect
    .poll(() => invokedCommands(page))
    .toContain("plugin:opener|open_url");
  expect(page.url()).toContain("notification.html");
});

const streamIdOfPendingChat = async (page: Page) => {
  await expect.poll(async () => (await chatPayloads(page)).length).toBe(1);
  const [parsed] = await chatPayloads(page);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("streamId" in parsed) ||
    typeof parsed.streamId !== "string"
  ) {
    throw new Error("Chat request carried no stream id");
  }
  return parsed.streamId;
};

test("the local answer shows up while Qwen3 4B is still writing it", async ({
  page,
}) => {
  await page.goto(chatUrl("Final answer."));
  await holdChatReply(page);
  await page.getByPlaceholder("Ask anything").fill("Stream it");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Answering…")).toBeVisible();

  const answer = page.locator('[data-chat-role="assistant"]');
  const streamId = await streamIdOfPendingChat(page);
  await emitTauriEvent(page, "polish-chat-answer", {
    answer: "Final ans",
    stream_id: streamId,
  });
  await expect(answer).toContainText("Final ans");
  await expect(page.getByText("Answering…")).toBeHidden();

  await emitTauriEvent(page, "polish-chat-answer", {
    answer: "Ignore me",
    stream_id: "another-stream",
  });
  await releaseChatReply(page);
  await expect(answer).toHaveText("Final answer.");
});

test("stopping mid-answer keeps the streamed text and tells Qwen3 4B to stop", async ({
  page,
}) => {
  await page.goto(chatUrl("Final answer."));
  await holdChatReply(page);
  await page.getByPlaceholder("Ask anything").fill("Stream it");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Answering…")).toBeVisible();

  const streamId = await streamIdOfPendingChat(page);
  await emitTauriEvent(page, "polish-chat-answer", {
    answer: "Half an ans",
    stream_id: streamId,
  });
  const answer = page.locator('[data-chat-role="assistant"]');
  await expect(answer).toContainText("Half an ans");

  await page.getByRole("button", { name: "Stop" }).click();

  await expect
    .poll(() => invokedCommandPayloads(page, "stop_polish_chat"))
    .toEqual([JSON.stringify({ streamId })]);
  await expect(answer).toHaveText("Half an ans");
});
