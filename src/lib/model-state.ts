// Pure state machine mirroring Rust transcription model lifecycle via `model-state-changed`.
export type ModelState = "Unloaded" | "Loading" | "Ready" | "Error";

export type ModelStateEventType =
  | "loading_started"
  | "loading_completed"
  | "loading_failed"
  | "unloaded";

export interface ModelStateEvent {
  error?: string;
  event_type: ModelStateEventType;
  model_id?: string;
  model_name?: string;
}

export const initialModelState = (): ModelState => "Unloaded";

export const nextModelState = (
  current: ModelState,
  event: ModelStateEvent
): ModelState => {
  switch (event.event_type) {
    case "loading_started":
      return "Loading";
    case "loading_completed":
      // Guard against late events after unload resurrecting "Ready".
      return current === "Loading" ? "Ready" : current;
    case "loading_failed":
      return current === "Loading" ? "Error" : current;
    case "unloaded":
      return "Unloaded";
    default:
      return current;
  }
};

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// onChange fires only on derived-state transition (reference-identity stable).
export const subscribeModelState = (
  onChange: (state: ModelState) => void
): Promise<UnlistenFn> => {
  let current = initialModelState();
  onChange(current);
  return listen<ModelStateEvent>("model-state-changed", (event) => {
    const next = nextModelState(current, event.payload);
    if (next !== current) {
      current = next;
      onChange(current);
    }
  });
};

// Fire-and-forget engine prewarm. Idempotent via Rust `plan_prewarm`.
export const requestPrewarm = (): void => {
  invoke("prewarm_models").catch((error: unknown) => {
    console.warn("prewarm_models invoke failed:", error);
  });
};
