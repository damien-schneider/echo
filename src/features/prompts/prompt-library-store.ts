import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { create } from "zustand";

const PromptEntrySchema = z.object({
  id: z.string(),
  instruction: z.string(),
  locked: z.boolean(),
  name: z.string(),
});

export type PromptEntry = z.infer<typeof PromptEntrySchema>;

type PromptLibrary =
  | { status: "loading" }
  | { message: string; status: "error" }
  | { entries: PromptEntry[]; status: "ready" };

interface PromptLibraryStore {
  library: PromptLibrary;
  load: () => Promise<void>;
}

export const usePromptLibraryStore = create<PromptLibraryStore>((set) => ({
  library: { status: "loading" },
  load: async () => {
    try {
      const entries = z
        .array(PromptEntrySchema)
        .parse(await invoke("list_prompts"));
      set({ library: { entries, status: "ready" } });
    } catch (error) {
      set({ library: { message: String(error), status: "error" } });
    }
  },
}));
