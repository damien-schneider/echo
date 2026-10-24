import {
  emitTauriEvent,
  invokedCommandPayloads,
  NOTIFICATION_URL,
  test,
} from "@e2e/fixtures";
import { expect, type Page } from "@playwright/test";

const ECHO_REPLY = "Revenue rose by nearly a fifth.";

interface ChatMessage {
  content: string;
  role: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  system: string;
}

const isChatRequest = (value: unknown): value is ChatRequest =>
  typeof value === "object" &&
  value !== null &&
  "system" in value &&
  typeof value.system === "string" &&
  "messages" in value &&
  Array.isArray(value.messages);

const chatRequests = async (page: Page) => {
  const payloads = await invokedCommandPayloads(page, "chat_with_polish_model");
  return payloads
    .map((payload): unknown => JSON.parse(payload))
    .filter(isChatRequest);
};

const openChatAbout = (page: Page, selectedText: string) =>
  page.goto(
    `${NOTIFICATION_URL}?polish=ready&notificationRequest=chat&chatReply=${encodeURIComponent(ECHO_REPLY)}&selectedContext=${encodeURIComponent(selectedText)}`
  );

const sendFromComposer = async (page: Page, question: string) => {
  const composer = page.getByPlaceholder("Ask about this text");
  await composer.click();
  await composer.fill(question);
  await page.getByRole("button", { name: "Send" }).click();
};

test.describe("chat keeps the text selected in the user's app", () => {
  test("clicking into the composer sends the selection to Qwen3 4B", async ({
    page,
  }) => {
    const selectedText = "Revenue grew 18% year over year.";

    await test.step("Given chat opened over a selection in another app", () =>
      openChatAbout(page, selectedText));
    await test.step("When the user clicks into the composer and sends a question", () =>
      sendFromComposer(page, "What does this mean?"));

    await test.step("Then Qwen3 4B answers about the selected text", async () => {
      await expect(page.getByText(ECHO_REPLY)).toBeVisible();
      const [request] = await chatRequests(page);
      expect(request?.system).toContain(selectedText);
      expect(request?.messages.at(-1)).toEqual({
        content: "What does this mean?",
        role: "user",
      });
    });
    await test.step("And the reference stays attached for the next message", () =>
      expect(
        page.getByRole("group", { name: "Selected text context" })
      ).toContainText(selectedText));
  });

  test("a new message after selecting other text sends the newer selection", async ({
    page,
  }) => {
    await openChatAbout(page, "Revenue grew 18% year over year.");
    await sendFromComposer(page, "What does this mean?");
    await expect(page.getByText(ECHO_REPLY)).toBeVisible();

    await test.step("Given the user selected other text before coming back", () =>
      emitTauriEvent(page, "overlay-chat-context", {
        context: {
          source: "selection",
          text: "Churn fell to 2% in Q3.",
          truncated: false,
        },
        generation: 1,
        state: "ready",
      }));
    await test.step("When the user clicks into the composer and sends a new message", () =>
      sendFromComposer(page, "And this one?"));

    await test.step("Then Qwen3 4B receives the newer selection with the thread", async () => {
      await expect.poll(async () => (await chatRequests(page)).length).toBe(2);
      const latest = (await chatRequests(page))[1];
      expect(latest?.system).toContain("Churn fell to 2% in Q3.");
      expect(latest?.system).not.toContain("Revenue grew 18%");
      expect(latest?.messages.at(-1)).toEqual({
        content: "And this one?",
        role: "user",
      });
    });
  });
});
