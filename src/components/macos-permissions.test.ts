import { describe, expect, it } from "bun:test";
import type { SetStateAction } from "react";
import {
  nextCheckedState,
  type PermissionState,
  runPermissionAction,
  VERIFYING_CHECK_LIMIT,
} from "@/components/macos-permissions";

const words = { button: "", description: "", title: "" };

const sessionAt = (initial: PermissionState, isGranted: boolean) => {
  let state = initial;
  const session = {
    permission: {
      check: () => Promise.resolve(isGranted),
      copy: {
        check_error: words,
        checking: words,
        denied: words,
        request_error: words,
        requesting: words,
        verifying: words,
      },
      label: "Microphone",
      request: () => Promise.resolve(),
    },
    setState: (next: SetStateAction<PermissionState>) => {
      state = typeof next === "function" ? next(state) : next;
    },
    tracker: {
      current: { checksSinceRequest: 0, failureCount: 0, requestId: 0 },
    },
  };
  return { session, state: () => state };
};

describe("permission gate", () => {
  it("reports a denial when the user checks again after refusing the prompt", async () => {
    const gate = sessionAt("verifying", false);

    await runPermissionAction(gate.session, "verifying");

    expect(gate.state()).toBe("denied");
  });

  it("stops waiting for a grant that never comes", () => {
    expect(nextCheckedState("verifying", false, VERIFYING_CHECK_LIMIT)).toBe(
      "denied"
    );
  });

  it("keeps waiting for the grant right after the prompt closes", async () => {
    const gate = sessionAt("denied", false);

    await runPermissionAction(gate.session, "denied");

    expect(gate.state()).toBe("verifying");
  });

  it("unlocks as soon as the grant arrives", async () => {
    const gate = sessionAt("verifying", true);

    await runPermissionAction(gate.session, "verifying");

    expect(gate.state()).toBe("granted");
  });
});
