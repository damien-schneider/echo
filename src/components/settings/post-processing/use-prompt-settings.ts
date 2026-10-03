import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import type { LLMPrompt } from "@/lib/types";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";
export function usePromptSettings(initialPrompt: LLMPrompt | undefined) {
  const postProcessEnabled = useSetting("post_process_enabled") ?? false;
  const prompts = useSetting("post_process_prompts") || [];
  const selectedPromptId = useSetting("post_process_selected_prompt_id") || "";
  const isPromptIdUpdating = useIsSettingUpdating(
    "post_process_selected_prompt_id"
  );
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const refreshSettings = useSettingsStore((s) => s.refreshSettings);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState(initialPrompt?.name ?? "");
  const [draftText, setDraftText] = useState(initialPrompt?.prompt ?? "");
  const selectedPrompt =
    prompts.find((prompt) => prompt.id === selectedPromptId) || null;
  const handlePromptSelect = (promptId: string | null) => {
    if (promptId === "none") {
      updateSetting("post_process_selected_prompt_id", null);
      setIsCreating(false);
      setIsEditingName(false);
      return;
    }
    if (!promptId) {
      return;
    }
    updateSetting("post_process_selected_prompt_id", promptId);
    setIsCreating(false);
    setIsEditingName(false);
  };
  const handleCreatePrompt = async () => {
    if (!(draftName.trim() && draftText.trim())) {
      return;
    }
    try {
      const newPrompt = await invoke<LLMPrompt>("add_post_process_prompt", {
        name: draftName.trim(),
        prompt: draftText.trim(),
      });
      await refreshSettings();
      updateSetting("post_process_selected_prompt_id", newPrompt.id);
      setIsCreating(false);
    } catch (error) {
      console.error("Failed to create prompt:", error);
    }
  };
  const handleSaveNameEdit = async () => {
    if (!(selectedPromptId && draftName.trim())) {
      return;
    }
    try {
      await invoke("update_post_process_prompt", {
        id: selectedPromptId,
        name: draftName.trim(),
        prompt: selectedPrompt?.prompt ?? draftText.trim(),
      });
      await refreshSettings();
      setIsEditingName(false);
    } catch (error) {
      console.error("Failed to update prompt name:", error);
    }
  };
  const handleCancelNameEdit = () => {
    setIsEditingName(false);
    if (selectedPrompt) {
      setDraftName(selectedPrompt.name);
    }
  };
  const handleUpdatePrompt = async () => {
    if (!(selectedPromptId && draftName.trim() && draftText.trim())) {
      return;
    }
    try {
      await invoke("update_post_process_prompt", {
        id: selectedPromptId,
        name: draftName.trim(),
        prompt: draftText.trim(),
      });
      await refreshSettings();
    } catch (error) {
      console.error("Failed to update prompt:", error);
    }
  };
  const handleDeletePrompt = async (promptId: string) => {
    if (!promptId) {
      return;
    }
    try {
      await invoke("delete_post_process_prompt", { id: promptId });
      await refreshSettings();
      setIsCreating(false);
      setIsEditingName(false);
    } catch (error) {
      console.error("Failed to delete prompt:", error);
    }
  };
  const handleCancelCreate = () => {
    setIsCreating(false);
    if (selectedPrompt) {
      setDraftName(selectedPrompt.name);
      setDraftText(selectedPrompt.prompt);
    } else {
      setDraftName("");
      setDraftText("");
    }
  };
  const handleStartCreate = () => {
    setIsCreating(true);
    setIsEditingName(false);
    setDraftName("");
    setDraftText("");
  };
  const handleStartEditName = () => {
    if (selectedPrompt) {
      setDraftName(selectedPrompt.name);
      setIsEditingName(true);
    }
  };
  return {
    postProcessEnabled,
    prompts,
    selectedPromptId,
    isPromptIdUpdating,
    isCreating,
    isEditingName,
    draftName,
    draftText,
    setDraftName,
    setDraftText,
    selectedPrompt,
    handlePromptSelect,
    handleCreatePrompt,
    handleSaveNameEdit,
    handleCancelNameEdit,
    handleUpdatePrompt,
    handleDeletePrompt,
    handleCancelCreate,
    handleStartCreate,
    handleStartEditName,
  };
}
