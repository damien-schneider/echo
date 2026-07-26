import { describe, expect, it } from "bun:test";
import {
  buildChatModelOptions,
  chatModelModeForOption,
  chatModelOptionId,
  chatModelOptionsForMode,
  selectedChatModelOption,
} from "@/features/overlay-chat/chat";

const settings = {
  post_process_models: {
    anthropic: "claude-sonnet-4-5",
    ollama: "qwen2.5:7b",
    openai: "",
  },
  post_process_provider_id: "anthropic",
  post_process_providers: [
    {
      base_url: "https://api.openai.com/v1",
      id: "openai",
      label: "OpenAI",
    },
    {
      base_url: "https://api.anthropic.com/v1",
      id: "anthropic",
      label: "Anthropic",
    },
    {
      base_url: "http://localhost:11434/v1",
      id: "ollama",
      label: "Ollama",
    },
  ],
};

describe("buildChatModelOptions", () => {
  it("keeps only providers with a configured model", () => {
    const options = buildChatModelOptions(settings);

    expect(options.map((option) => option.id)).toEqual([
      chatModelOptionId("anthropic", "claude-sonnet-4-5"),
      chatModelOptionId("ollama", "qwen2.5:7b"),
    ]);
  });

  it("marks the local Ollama model for the compact picker", () => {
    const options = buildChatModelOptions(settings);
    const localOption = selectedChatModelOption(
      options,
      chatModelOptionId("ollama", "qwen2.5:7b")
    );

    expect(localOption?.isLocal).toBe(true);
    expect(localOption?.label).toBe("Ollama · qwen2.5:7b");
  });
});

describe("selectedChatModelOption", () => {
  it("falls back to the first configured model", () => {
    const options = buildChatModelOptions(settings);

    expect(selectedChatModelOption(options, "")?.providerId).toBe("anthropic");
  });

  it("prefers the active provider when multiple models are configured", () => {
    const options = buildChatModelOptions({
      ...settings,
      post_process_models: {
        anthropic: "claude-sonnet-4-5",
        ollama: "qwen2.5:7b",
        openai: "gpt-5-mini",
      },
    });

    expect(selectedChatModelOption(options, "")?.providerId).toBe("anthropic");
  });
});

describe("chatModelModeForOption", () => {
  it("derives the initial mode from the first configured model", () => {
    const [firstOption] = buildChatModelOptions(settings);

    expect(chatModelModeForOption(firstOption)).toBe("cloud");
  });

  it("defaults to local while settings have no configured model", () => {
    expect(chatModelModeForOption(undefined)).toBe("local");
  });
});

describe("chatModelOptionsForMode", () => {
  it("returns only local models in local mode", () => {
    const options = buildChatModelOptions(settings);

    expect(
      chatModelOptionsForMode(options, "local").map(
        (option) => option.providerId
      )
    ).toEqual(["ollama"]);
  });

  it("returns only cloud models in cloud mode", () => {
    const options = buildChatModelOptions(settings);

    expect(
      chatModelOptionsForMode(options, "cloud").map(
        (option) => option.providerId
      )
    ).toEqual(["anthropic"]);
  });
});
