import { describe, expect, test } from "bun:test";
import {
  initialNativeOverlayTransition,
  type NativeOverlayTransitionState,
  nativeOverlayFailureMessage,
  nativeOverlayModeToSettle,
  reduceNativeOverlayTransition,
} from "@/features/overlay-controls/motion/native-window-transition";
import type { OverlayMode } from "@/features/overlay-controls/recording-overlay-state";

const prepared = (
  generation: number,
  error: string | null = null
): NativeOverlayTransitionState<OverlayMode> =>
  reduceNativeOverlayTransition(
    reduceNativeOverlayTransition(initialNativeOverlayTransition("compact"), {
      generation,
      type: "prepare_started",
    }),
    { error, generation, mode: "chat", type: "prepare_finished" }
  );

describe("native overlay transition", () => {
  test("stages the requested modes once the native preflight answers", () => {
    const state = prepared(1);

    expect(state.phase).toBe("morphing");
    expect(state.staged).toEqual({ generation: 1, mode: "chat" });
    expect(state.error).toBe(null);
  });

  test("still stages the render when the native preflight fails", () => {
    const state = prepared(1, nativeOverlayFailureMessage);

    expect(state.staged.mode).toBe("chat");
    expect(state.error).toBe(nativeOverlayFailureMessage);
  });

  test("ignores answers from superseded transitions", () => {
    const latest = prepared(2);

    const stale = reduceNativeOverlayTransition(latest, {
      error: null,
      generation: 1,
      mode: "panel",
      type: "prepare_finished",
    });

    expect(stale).toBe(latest);
  });

  test("settles only the generation that is still morphing", () => {
    const state = prepared(3);

    expect(nativeOverlayModeToSettle(state, 3)).toBe("chat");
    expect(nativeOverlayModeToSettle(state, 2)).toBeNull();

    const settled = reduceNativeOverlayTransition(state, {
      error: null,
      generation: 3,
      type: "settle_finished",
    });

    expect(settled.phase).toBe("idle");
    expect(nativeOverlayModeToSettle(settled, 3)).toBeNull();
  });

  test("keeps a preflight failure visible until it is dismissed", () => {
    const failed = prepared(1, nativeOverlayFailureMessage);

    const settled = reduceNativeOverlayTransition(failed, {
      error: null,
      generation: 1,
      type: "settle_finished",
    });
    expect(settled.error).toBe(nativeOverlayFailureMessage);

    const dismissed = reduceNativeOverlayTransition(settled, {
      type: "error_dismissed",
    });
    expect(dismissed.error).toBeNull();
    expect(
      reduceNativeOverlayTransition(dismissed, { type: "error_dismissed" })
    ).toBe(dismissed);
  });

  test("clears a stale failure when a later transition succeeds", () => {
    const failed = prepared(1, nativeOverlayFailureMessage);

    const recovered = reduceNativeOverlayTransition(failed, {
      error: null,
      generation: 2,
      mode: "chat",
      type: "prepare_finished",
    });

    expect(recovered.error).toBeNull();
  });

  test("reports a settlement failure after a healthy preflight", () => {
    const state = reduceNativeOverlayTransition(prepared(4), {
      error: nativeOverlayFailureMessage,
      generation: 4,
      type: "settle_finished",
    });

    expect(state.error).toBe(nativeOverlayFailureMessage);
    expect(state.phase).toBe("idle");
  });

  test("each window starts idle on the mode it opens with", () => {
    expect(initialNativeOverlayTransition("compact").staged.mode).toBe(
      "compact"
    );
    expect(initialNativeOverlayTransition("recording").staged.mode).toBe(
      "recording"
    );
    expect(initialNativeOverlayTransition("compact").phase).toBe("idle");
  });
});
