import { emit } from "@tauri-apps/api/event";
import type { SummarySetupSection } from "@/lib/llm/meeting-summary";
import { useMeetingStore } from "@/stores/meeting-store";

export const openSummarySetup = (section: SummarySetupSection) => {
  if (section === "meeting") {
    useMeetingStore.getState().unselectMeeting();
  }
  emit("open-settings-section", section);
};
