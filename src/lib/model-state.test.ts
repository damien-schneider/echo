import { describe, expect, it } from "bun:test";
import {
  initialModelState,
  type ModelState,
  type ModelStateEvent,
  nextModelState,
} from "./model-state";

describe("initialModelState", () => {
  it("starts as Unloaded", () => {
    expect(initialModelState()).toBe<ModelState>("Unloaded");
  });
});

describe("nextModelState", () => {
  it("Unloaded + loading_started -> Loading", () => {
    const evt: ModelStateEvent = {
      event_type: "loading_started",
      model_id: "ggml-base",
    };
    expect(nextModelState("Unloaded", evt)).toBe<ModelState>("Loading");
  });

  it("Loading + loading_completed -> Ready", () => {
    const evt: ModelStateEvent = {
      event_type: "loading_completed",
      model_id: "ggml-base",
    };
    expect(nextModelState("Loading", evt)).toBe<ModelState>("Ready");
  });

  it("Loading + loading_failed -> Error", () => {
    const evt: ModelStateEvent = {
      error: "boom",
      event_type: "loading_failed",
      model_id: "ggml-base",
    };
    expect(nextModelState("Loading", evt)).toBe<ModelState>("Error");
  });

  it("Ready + unloaded -> Unloaded", () => {
    const evt: ModelStateEvent = { event_type: "unloaded" };
    expect(nextModelState("Ready", evt)).toBe<ModelState>("Unloaded");
  });

  it("Error + loading_started -> Loading (retry after failure)", () => {
    const evt: ModelStateEvent = { event_type: "loading_started" };
    expect(nextModelState("Error", evt)).toBe<ModelState>("Loading");
  });

  it("Error + unloaded -> Unloaded", () => {
    const evt: ModelStateEvent = { event_type: "unloaded" };
    expect(nextModelState("Error", evt)).toBe<ModelState>("Unloaded");
  });

  it("Error + loading_failed stays Error (guard: only Loading transitions)", () => {
    const evt: ModelStateEvent = { event_type: "loading_failed" };
    expect(nextModelState("Error", evt)).toBe<ModelState>("Error");
  });

  it("Ready + loading_failed stays Ready (guard: only Loading transitions)", () => {
    const evt: ModelStateEvent = { event_type: "loading_failed" };
    expect(nextModelState("Ready", evt)).toBe<ModelState>("Ready");
  });

  it("rejects loading_completed from Unloaded (stays Unloaded)", () => {
    // Out-of-order event; load already dropped. Don't fake Ready.
    const evt: ModelStateEvent = { event_type: "loading_completed" };
    expect(nextModelState("Unloaded", evt)).toBe<ModelState>("Unloaded");
  });

  it("ignores unknown event types", () => {
    // Forward-compat: unknown future Rust events must not wedge FSM.
    const evt = {
      event_type: "warming_started",
    } as unknown as ModelStateEvent;
    expect(nextModelState("Loading", evt)).toBe<ModelState>("Loading");
  });
});
