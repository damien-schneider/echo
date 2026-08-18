import {
  emitTauriEvent,
  holdChatContextRefresh,
  holdChatReply,
  invokedCommandPayloads,
  invokedCommands,
  NOTIFICATION_URL,
  releaseChatContextRefresh,
  releaseChatReply,
  test,
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

test("the prompt appears before the selected-text lookup answers", async ({
  page,
}) => {
  await page.goto(chatUrl());
  await holdChatContextRefresh(page);
  const input = page.getByPlaceholder("Ask anything");
  await input.fill("What is this?");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.locator('[data-chat-role="user"]')).toHaveText(
    "What is this?"
  );
  await expect(page.getByText("Thinking")).toBeVisible();
  await expect(input).toHaveValue("");

  await releaseChatContextRefresh(page);
  await expect(page.locator('[data-chat-role="assistant"]')).toContainText(
    "Echo 4B reply"
  );
});

test("a pending answer can be stopped and leaves the thread intact", async ({
  page,
}) => {
  await page.goto(chatUrl());
  await holdChatContextRefresh(page);
  await page.getByPlaceholder("Ask anything").fill("Take your time");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Thinking")).toBeVisible();

  await page.getByRole("button", { name: "Stop" }).click();

  await expect(page.getByText("Thinking")).toBeHidden();
  await expect(page.locator('[data-chat-role="user"]')).toHaveText(
    "Take your time"
  );
  await expect(page.locator('[data-chat-role="assistant"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
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
  const [payload] = await invokedCommandPayloads(
    page,
    "chat_with_polish_model"
  );
  const parsed: unknown = JSON.parse(payload ?? "{}");
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

test("the local answer shows up while Echo 4B is still writing it", async ({
  page,
}) => {
  await page.goto(chatUrl("Final answer."));
  await holdChatReply(page);
  await page.getByPlaceholder("Ask anything").fill("Stream it");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Thinking")).toBeVisible();

  const answer = page.locator('[data-chat-role="assistant"]');
  const streamId = await streamIdOfPendingChat(page);
  await emitTauriEvent(page, "polish-chat-answer", {
    answer: "Final ans",
    stream_id: streamId,
  });
  await expect(answer).toContainText("Final ans");
  await expect(page.getByText("Thinking")).toBeHidden();

  await emitTauriEvent(page, "polish-chat-answer", {
    answer: "Ignore me",
    stream_id: "another-stream",
  });
  await releaseChatReply(page);
  await expect(answer).toHaveText("Final answer.");
});

test("stopping mid-answer keeps the streamed text and tells Echo 4B to stop", async ({
  page,
}) => {
  await page.goto(chatUrl("Final answer."));
  await holdChatReply(page);
  await page.getByPlaceholder("Ask anything").fill("Stream it");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Thinking")).toBeVisible();

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
