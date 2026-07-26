import {
  deferNextOverlayModePreflights,
  emitTauriEvent,
  HUD_URL,
  NOTIFICATION_URL,
  resolveOverlayModePreflight,
  test,
  waitForOverlayModePreflights,
  waitForTauriListener,
} from "@e2e/fixtures";
import { expect, type Page } from "@playwright/test";

const notificationUrl = `${NOTIFICATION_URL}?polish=ready`;
const paintedShellSelector = [
  '[data-component="echo-island-morph"]',
  ".echo-island-resident-shell",
  ".echo-island",
].join(", ");

const openProcessing = async (page: Page) => {
  await page.goto(notificationUrl);
  await waitForTauriListener(page, "show-overlay");
  await emitTauriEvent(page, "show-overlay", {
    message: "Polishing…",
    state: "processing",
  });
  await expect(
    page.getByRole("region", { name: "Echo activity" })
  ).toBeVisible();
};

test("keeps one painted shell node while the notification changes its mind", async ({
  page,
}) => {
  await openProcessing(page);

  const observation = await page.evaluate(async (selector) => {
    const morph = document.querySelector<HTMLElement>(
      '[data-component="echo-island-morph"]'
    );
    if (!morph) {
      throw new Error("Echo island morph is missing");
    }
    const paintedShells = () =>
      Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(
        (element) => {
          const background = getComputedStyle(element).backgroundColor;
          return !(
            background === "rgba(0, 0, 0, 0)" || background === "transparent"
          );
        }
      );
    const initialShell = paintedShells()[0];
    const counts: number[] = [];
    window.__ECHO_TEST__.emit("show-overlay", {
      message: "Polished",
      state: "tool",
    });
    for (let frame = 0; frame < 50; frame += 1) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      counts.push(paintedShells().length);
    }
    const finalShell = paintedShells()[0];
    return {
      maximumPaintedShells: Math.max(...counts),
      minimumPaintedShells: Math.min(...counts),
      morphBackground: getComputedStyle(morph).backgroundColor,
      samePaintedShell:
        initialShell !== undefined && initialShell === finalShell,
    };
  }, paintedShellSelector);

  expect(observation.minimumPaintedShells).toBe(1);
  expect(observation.maximumPaintedShells).toBe(1);
  expect(observation.samePaintedShell).toBe(true);
  expect(observation.morphBackground).not.toBe("rgba(0, 0, 0, 0)");
});

test("stages processing only after the native geometry preflight", async ({
  page,
}) => {
  await page.goto(notificationUrl);
  await waitForTauriListener(page, "show-overlay");
  await deferNextOverlayModePreflights(page, 1);

  await emitTauriEvent(page, "show-overlay", {
    message: "Polishing…",
    state: "processing",
  });
  await waitForOverlayModePreflights(page, 1);

  await expect(
    page.locator('[data-component="echo-island-morph"]')
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Echo activity" })
  ).toBeHidden();

  await resolveOverlayModePreflight(page, 0);
  await expect(
    page.getByRole("region", { name: "Echo activity" })
  ).toBeVisible();
});

test("grows out of the notch through intermediate widths", async ({ page }) => {
  await page.goto(notificationUrl);
  await waitForTauriListener(page, "show-overlay");

  const trajectory = await page.evaluate(async () => {
    window.__ECHO_TEST__.emit("show-overlay", {
      message: "Polishing…",
      state: "processing",
    });
    const samples: Array<{ height: number; width: number }> = [];
    for (let frame = 0; frame < 60; frame += 1) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      const morph = document.querySelector<HTMLElement>(
        '[data-component="echo-island-morph"]'
      );
      if (morph) {
        const bounds = morph.getBoundingClientRect();
        samples.push({ height: bounds.height, width: bounds.width });
      }
    }
    return samples;
  });

  expect(trajectory.length).toBeGreaterThan(1);
  expect(trajectory.every((sample) => sample.width > 0)).toBe(true);
  const widths = trajectory.map((sample) => sample.width);
  const minimumWidth = Math.min(...widths);
  const maximumWidth = Math.max(...widths);
  expect(maximumWidth - minimumWidth).toBeGreaterThan(20);
  expect(
    widths.some((width) => width > minimumWidth + 1 && width < maximumWidth - 1)
  ).toBe(true);
});

test("keeps outgoing content mounted for its exit before removing it", async ({
  page,
}) => {
  await openProcessing(page);

  const exit = await page.evaluate(async () => {
    const outgoing = document.querySelector<HTMLElement>(
      '[aria-label="Echo activity"]'
    );
    if (!outgoing) {
      throw new Error("Echo activity is missing");
    }
    let framesMounted = 0;
    let sawOutgoingWithIncoming = false;
    window.__ECHO_TEST__.emit("hide-overlay", null);
    for (let frame = 0; frame < 40; frame += 1) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      if (outgoing.isConnected) {
        framesMounted += 1;
      }
      sawOutgoingWithIncoming ||=
        outgoing.isConnected &&
        document.querySelector('[data-component="echo-island-morph"]') !== null;
    }
    return { framesMounted, sawOutgoingWithIncoming };
  });

  expect(exit.framesMounted).toBeGreaterThan(1);
  expect(exit.sawOutgoingWithIncoming).toBe(true);
  // The shell only leaves the DOM once it has finished folding into the notch.
  await expect(page.getByRole("region", { name: "Echo activity" })).toHaveCount(
    0
  );
});

test("keys outgoing and incoming activity text before settling", async ({
  page,
}) => {
  await openProcessing(page);
  await expect(page.getByText("Polishing…", { exact: true })).toBeVisible();

  const transition = await page.evaluate(async () => {
    const outgoing = document.querySelector<HTMLOutputElement>(
      '[aria-label="Echo activity"] output'
    );
    if (!outgoing) {
      throw new Error("Polish activity text is missing");
    }
    let sawBothCopies = false;
    let sawOutgoingDuringIncoming = false;
    window.__ECHO_TEST__.emit("show-overlay", {
      message: "Polished",
      state: "tool",
    });
    for (let frame = 0; frame < 40; frame += 1) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      const outputs = Array.from(
        document.querySelectorAll<HTMLOutputElement>(
          '[aria-label="Echo activity"] output'
        )
      );
      const copy = outputs.map((output) => output.textContent?.trim());
      if (copy.includes("Polishing…") && copy.includes("Polished")) {
        sawBothCopies = true;
      }
      if (
        outgoing.isConnected &&
        outputs.some(
          (output) => output !== outgoing && output.textContent === "Polished"
        )
      ) {
        sawOutgoingDuringIncoming = true;
      }
    }
    const finalOutputs = Array.from(
      document.querySelectorAll<HTMLOutputElement>(
        '[aria-label="Echo activity"] output'
      )
    );
    return {
      finalCount: finalOutputs.length,
      finalText: finalOutputs[0]?.textContent?.trim(),
      replacedOutgoing: finalOutputs[0] !== outgoing,
      sawBothCopies,
      sawOutgoingDuringIncoming,
    };
  });

  expect(transition.sawBothCopies).toBe(true);
  expect(transition.sawOutgoingDuringIncoming).toBe(true);
  expect(transition.replacedOutgoing).toBe(true);
  expect(transition.finalCount).toBe(1);
  expect(transition.finalText).toBe("Polished");
});

test("settles without transitional layers with reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openProcessing(page);

  const morph = page.locator('[data-component="echo-island-morph"]');
  await expect(morph).toHaveAttribute("data-mode", "recording");
  const settled = await morph.evaluate((element) => ({
    activityCount: document.querySelectorAll('[aria-label="Echo activity"]')
      .length,
    contentCount: element.querySelectorAll(".echo-island-morph-content").length,
    runningAnimations: element
      .getAnimations({ subtree: true })
      .filter((animation) => animation.playState === "running").length,
  }));

  expect(settled.contentCount).toBe(1);
  expect(settled.activityCount).toBe(1);
  expect(settled.runningAnimations).toBe(0);
});

test("the HUD stays exactly where it is while a recording runs", async ({
  page,
}) => {
  await page.goto(`${HUD_URL}?polish=ready`);
  const morph = page.locator('[data-component="echo-island-morph"]');
  await expect(
    page.getByRole("button", { name: "Start recording" })
  ).toBeVisible();
  const resting = await morph.boundingBox();

  await emitTauriEvent(page, "show-overlay", "recording");

  await expect(
    page.getByRole("button", { name: "Stop recording" })
  ).toBeVisible();
  expect(await morph.boundingBox()).toEqual(resting);
});
