import {
  test as echoTest,
  emitTauriEvent,
  NOTIFICATION_URL,
} from "@e2e/fixtures";
import { defineNetworkFixture, type NetworkFixture } from "@msw/playwright";
import { expect, type Page } from "@playwright/test";
import { HttpResponse, http } from "msw";

const PROVIDER_CHAT_URL = "https://llm.echo.test/v1/chat/completions";
const PROVIDER_REPLY = "Revenue rose by nearly a fifth.";

const test = echoTest.extend<{ network: NetworkFixture }>({
  network: [
    async ({ context }, use) => {
      const network = defineNetworkFixture({
        context,
        onUnhandledFrame: "bypass",
      });
      await network.enable();
      await use(network);
      await network.disable();
    },
    { auto: true },
  ],
});

interface ProviderMessage {
  content: string;
  role: string;
}

const isChatRequest = (
  body: unknown
): body is { messages: ProviderMessage[] } =>
  typeof body === "object" &&
  body !== null &&
  "messages" in body &&
  Array.isArray(body.messages);

const streamedReply = () => {
  const chunk = (delta: object, finishReason: string | null) =>
    `data: ${JSON.stringify({
      choices: [{ delta, finish_reason: finishReason, index: 0 }],
      created: 1,
      id: "chatcmpl-echo",
      model: "echo-test-model",
      object: "chat.completion.chunk",
    })}\n\n`;
  return [
    chunk({ content: PROVIDER_REPLY, role: "assistant" }, null),
    chunk({}, "stop"),
    "data: [DONE]\n\n",
  ].join("");
};

const recordProviderConversations = (network: NetworkFixture) => {
  const conversations: ProviderMessage[][] = [];
  network.use(
    http.post(PROVIDER_CHAT_URL, async ({ request }) => {
      const body = await request.json();
      if (isChatRequest(body)) {
        conversations.push(body.messages);
      }
      return new HttpResponse(streamedReply(), {
        headers: {
          "access-control-allow-origin": "*",
          "content-type": "text/event-stream",
        },
      });
    })
  );
  return conversations;
};

const configureCloudProvider = (page: Page) =>
  page.addInitScript(() => {
    const state = window.__ECHO_TEST_STATE__;
    const respond = state.respond;
    state.respond = (command, args) => {
      if (command !== "plugin:store|get") {
        return respond(command, args);
      }
      return [
        {
          bindings: {},
          post_process_api_keys: { custom: "test-key" },
          post_process_models: { custom: "echo-test-model" },
          post_process_provider_id: "custom",
          post_process_providers: [
            {
              allow_base_url_edit: true,
              base_url: "https://llm.echo.test/v1",
              id: "custom",
              label: "Custom",
            },
          ],
        },
        true,
      ];
    };
  });

const openChatAbout = async (page: Page, selectedText: string) => {
  await configureCloudProvider(page);
  await page.goto(
    `${NOTIFICATION_URL}?polish=ready&notificationRequest=chat&selectedContext=${encodeURIComponent(selectedText)}`
  );
  await page.getByRole("button", { name: "Cloud" }).click();
  await expect(
    page.getByRole("combobox", { name: "Provider and model" })
  ).toContainText("Custom · echo-test-model");
};

const sendFromComposer = async (page: Page, question: string) => {
  const composer = page.getByPlaceholder("Ask about this text");
  await composer.click();
  await composer.fill(question);
  await page.getByRole("button", { name: "Send" }).click();
};

test.describe("chat keeps the text selected in the user's app", () => {
  test("clicking into the composer sends the selection to the provider", async ({
    network,
    page,
  }) => {
    const selectedText = "Revenue grew 18% year over year.";
    const conversations = recordProviderConversations(network);

    await test.step("Given chat opened over a selection in another app", () =>
      openChatAbout(page, selectedText));
    await test.step("When the user clicks into the composer and sends a question", () =>
      sendFromComposer(page, "What does this mean?"));

    await test.step("Then the provider answers about the selected text", async () => {
      await expect(page.getByText(PROVIDER_REPLY)).toBeVisible();
      const [conversation] = conversations;
      expect(conversation?.[0]?.role).toBe("system");
      expect(conversation?.[0]?.content).toContain(selectedText);
      expect(conversation?.at(-1)).toEqual({
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
    network,
    page,
  }) => {
    const conversations = recordProviderConversations(network);
    await openChatAbout(page, "Revenue grew 18% year over year.");
    await sendFromComposer(page, "What does this mean?");
    await expect(page.getByText(PROVIDER_REPLY)).toBeVisible();

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

    await test.step("Then the provider receives the newer selection with the thread", async () => {
      await expect.poll(() => conversations.length).toBe(2);
      const latest = conversations[1] ?? [];
      expect(latest[0]?.content).toContain("Churn fell to 2% in Q3.");
      expect(latest[0]?.content).not.toContain("Revenue grew 18%");
      expect(latest.at(-1)).toEqual({ content: "And this one?", role: "user" });
    });
  });
});
