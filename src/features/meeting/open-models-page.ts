import { emit } from "@tauri-apps/api/event";

export const OPEN_MODELS_LABEL = "Open Models";

export const openModelsPage = () => emit("open-settings-section", "models");
