import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { z } from "zod";
import type { ChatPrompt } from "@/features/overlay-chat/chat";
import { usePromptLibraryStore } from "@/features/prompts/prompt-library-store";
import {
  choiceFromPromptRef,
  PROMPT_SURFACES,
  promptRefFromChoice,
  surfaceChoices,
} from "@/features/prompts/prompt-surfaces";

type RememberedPrompt =
  | { status: "loading" }
  | { id: string | null; status: "ready" };

const readRememberedPrompt = async (): Promise<string | null> =>
  z
    .string()
    .nullable()
    .parse(await invoke("get_chat_prompt"));

export interface ChatPromptChoice {
  activeChoice: string;
  choices: { label: string; value: string }[];
  choose: (choice: string) => Promise<void>;
  isReady: boolean;
  label: string;
  prompt: ChatPrompt | null;
}

export const useChatPrompt = (): ChatPromptChoice => {
  const library = usePromptLibraryStore((s) => s.library);
  const loadLibrary = usePromptLibraryStore((s) => s.load);
  const [remembered, setRemembered] = useState<RememberedPrompt>({
    status: "loading",
  });
  useEffect(() => {
    loadLibrary();
    readRememberedPrompt()
      .catch(() => null)
      .then((id) => setRemembered({ id, status: "ready" }));
  }, [loadLibrary]);
  const entries = library.status === "ready" ? library.entries : [];
  const activeId = remembered.status === "ready" ? remembered.id : null;
  const prompt = entries.find((entry) => entry.id === activeId) ?? null;
  return {
    activeChoice: choiceFromPromptRef(prompt?.id),
    choices: surfaceChoices("chat", entries),
    choose: async (choice) => {
      const id = promptRefFromChoice(choice);
      setRemembered({ id, status: "ready" });
      await invoke("set_chat_prompt", { prompt: id });
    },
    isReady: remembered.status === "ready" && library.status !== "loading",
    label: prompt?.name ?? PROMPT_SURFACES.chat.emptyLabel,
    prompt,
  };
};
