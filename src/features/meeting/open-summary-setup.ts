import { emit } from "@tauri-apps/api/event";

export const SUMMARY_SETUP_LABEL = "Open Models";

// Models is where Echo 4B, which runs every summary, gets downloaded.
export const openSummarySetup = () => emit("open-settings-section", "models");
