import { describe, expect, test } from "bun:test";
import {
  dockEdgeForKey,
  OVERLAY_DRAG_COMMAND,
} from "@/features/overlay-controls/runtime/edge-dock-commands";

describe("dock edge keyboard mapping", () => {
  test("arrow keys move the island to the matching screen edge", () => {
    expect(dockEdgeForKey("ArrowLeft")).toBe("left");
    expect(dockEdgeForKey("ArrowRight")).toBe("right");
    expect(dockEdgeForKey("ArrowUp")).toBe("top");
    expect(dockEdgeForKey("ArrowDown")).toBe("bottom");
  });

  test("other keys stay with the focused control", () => {
    expect(dockEdgeForKey("Enter")).toBeNull();
    expect(dockEdgeForKey("Tab")).toBeNull();
    expect(dockEdgeForKey("a")).toBeNull();
    expect(dockEdgeForKey("constructor")).toBeNull();
  });
});

describe("overlay drag commands", () => {
  test("every drag step names one native command", () => {
    expect(Object.values(OVERLAY_DRAG_COMMAND)).toEqual([
      "begin_recording_overlay_snap_preview",
      "cancel_recording_overlay_snap_preview",
      "set_recording_overlay_dock_edge",
      "snap_recording_overlay_to_nearest_edge",
    ]);
  });
});
