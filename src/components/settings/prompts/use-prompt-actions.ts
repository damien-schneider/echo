import { invoke } from "@tauri-apps/api/core";
import { usePromptLibraryStore } from "@/features/prompts/prompt-library-store";
import { useSettingsStore } from "@/stores/settings-store";

export interface PromptDraft {
  instruction: string;
  name: string;
}

export const usePromptActions = () => {
  const loadLibrary = usePromptLibraryStore((s) => s.load);
  const refreshSettings = useSettingsStore((s) => s.refreshSettings);
  // Deleting a prompt can reset the surfaces that used it.
  const reloadAfter = async (change: Promise<unknown>) => {
    await change;
    await Promise.all([loadLibrary(), refreshSettings()]);
  };
  return {
    create: (draft: PromptDraft) =>
      reloadAfter(invoke("add_prompt", { ...draft })),
    remove: (id: string) => reloadAfter(invoke("delete_prompt", { id })),
    update: (id: string, draft: PromptDraft) =>
      reloadAfter(invoke("update_prompt", { id, ...draft })),
  };
};
