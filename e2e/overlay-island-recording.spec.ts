import {
  emitTauriEvent,
  invokedCommands,
  NOTIFICATION_URL,
  setOverlayNotch,
  test,
  waitForTauriListener,
} from "@e2e/fixtures";
import {
  pointNative,
  requiredBox,
  settledFrame,
} from "@e2e/overlay-island-probe";
import { expect } from "@playwright/test";

const overlayUrl = `${NOTIFICATION_URL}?polish=ready`;

test("recording offers explicit transcribe and cancel actions", async ({
  page,
}) => {
  await page.goto(overlayUrl);
  await waitForTauriListener(page, "show-overlay");
  await waitForTauriListener(page, "mic-level");

  await emitTauriEvent(page, "show-overlay", "recording");
  await expect(page.locator(".recording-overlay-root")).toHaveAttribute(
    "data-anchor",
    "top"
  );
  await expect(page.locator(".recording-overlay-root")).toHaveAttribute(
    "data-presentation",
    "bar"
  );
  await expect(page.getByText("Listening…")).toBeHidden();
  await expect(page.locator(".notch-bar-delay-0")).toHaveCount(0);

  const edge = page.locator(".echo-island-edge");
  await expect(edge).toHaveAttribute("data-edge", "voice");
  const quietVoice = await edge.evaluate((element) =>
    getComputedStyle(element).getPropertyValue("--echo-voice")
  );
  await emitTauriEvent(page, "mic-level", [0.9]);
  await expect
    .poll(() =>
      edge.evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--echo-voice")
      )
    )
    .not.toBe(quietVoice);

  const activity = page.locator(".echo-island-activity");
  await expect(activity).toHaveAttribute("data-has-text", "false");
  await emitTauriEvent(
    page,
    "transcription-progress",
    "Speech before a long pause remains visible."
  );
  await expect(activity).toHaveAttribute("data-has-text", "true");
  await expect(activity).toHaveCSS("width", "310px");
  await expect(
    page.getByText("Speech before a long pause remains visible.")
  ).toBeVisible();

  const submit = page.getByRole("button", {
    name: "Finish recording and transcribe",
  });
  await expect(submit).toBeVisible();
  await submit.click();
  await expect
    .poll(() => invokedCommands(page))
    .toContain("stop_transcription_from_overlay");

  await page.getByRole("button", { name: "Cancel current operation" }).click();
  await expect.poll(() => invokedCommands(page)).toContain("cancel_operation");
});

test("a recording keeps to the notch's sides until the first word arrives", async ({
  page,
}) => {
  const notch = { centerOffset: 0, topInset: 32, width: 196 };
  await page.setViewportSize({ height: 620, width: 800 });
  await page.goto(overlayUrl);
  await setOverlayNotch(page, notch);
  await waitForTauriListener(page, "show-overlay");
  await emitTauriEvent(page, "show-overlay", "recording");

  const morph = page.locator('[data-component="echo-island-morph"]');
  const hud = page.locator(
    '[data-component="island-hud"][data-layout="activity"]'
  );
  const body = hud.locator(':scope > [data-component="island-hud-body"]');
  const leftFlank = hud.locator(
    ':scope > .echo-island-hud-flank[data-side="left"]'
  );
  const rightFlank = hud.locator(
    ':scope > .echo-island-hud-flank[data-side="right"]'
  );
  await expect(morph).toHaveAttribute("data-notch-bridge", "true");
  await expect(hud).toHaveAttribute("data-flanked", "true");
  const ears = await settledFrame(morph);
  const [leftBox, rightBox] = await Promise.all([
    requiredBox(leftFlank),
    requiredBox(rightFlank),
  ]);
  const notchLeft = 800 / 2 - notch.width / 2;
  const notchRight = notchLeft + notch.width;
  expect(Math.abs(ears.height - leftBox.height)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(leftBox.y - ears.y)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(rightBox.y - ears.y)).toBeLessThanOrEqual(0.5);
  expect(leftBox.x + leftBox.width).toBeLessThanOrEqual(notchLeft + 0.5);
  expect(rightBox.x).toBeGreaterThanOrEqual(notchRight - 0.5);
  await expect(morph).toHaveCSS(
    "border-bottom-left-radius",
    `${leftBox.height / 2}px`
  );

  await emitTauriEvent(page, "transcription-progress", "First words");
  await expect(page.getByText("First words")).toBeVisible();
  const expanded = await settledFrame(morph);
  const [bodyBox, expandedLeft, expandedRight] = await Promise.all([
    requiredBox(body),
    requiredBox(leftFlank),
    requiredBox(rightFlank),
  ]);
  expect(expanded.height).toBeGreaterThan(leftBox.height + 40);
  expect(expandedLeft.y + expandedLeft.height).toBeLessThanOrEqual(
    bodyBox.y + 0.5
  );
  expect(expandedRight.y + expandedRight.height).toBeLessThanOrEqual(
    bodyBox.y + 0.5
  );
});

test("the edge light follows the voice while listening and keeps drifting into transcription", async ({
  page,
}) => {
  await page.goto(overlayUrl);
  await waitForTauriListener(page, "show-overlay");
  const edge = page.locator(".echo-island-edge");

  await emitTauriEvent(page, "show-overlay", "preparing");
  await expect(
    page.getByRole("button", { name: "Preparing local model…" })
  ).toBeVisible();
  await expect(edge).toHaveCount(0);

  await emitTauriEvent(page, "show-overlay", "recording");
  await expect(edge).toHaveAttribute("data-edge", "voice");
  const listeningLight = await edge.elementHandle();

  await emitTauriEvent(page, "show-overlay", "transcribing");
  await expect(edge).toHaveAttribute("data-edge", "drift");
  expect(await listeningLight?.evaluate((element) => element.isConnected)).toBe(
    true
  );
});

test("the listening edge appears without its trace under reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(overlayUrl);
  await waitForTauriListener(page, "show-overlay");
  await emitTauriEvent(page, "show-overlay", "recording");

  await expect(page.locator(".echo-island-edge")).toHaveCSS(
    "animation-name",
    "none"
  );
  await expect(page.locator(".echo-island-edge-trace")).toHaveCSS(
    "opacity",
    "0"
  );
});

test("an edge lit mid-speech starts at the voice's current level", async ({
  page,
}) => {
  await page.goto(overlayUrl);
  await waitForTauriListener(page, "show-overlay");
  await waitForTauriListener(page, "mic-level");
  await emitTauriEvent(page, "show-overlay", "preparing");
  await emitTauriEvent(page, "mic-level", [0.9]);
  await emitTauriEvent(page, "show-overlay", "recording");

  const edge = page.locator(".echo-island-edge");
  await expect(edge).toBeVisible();
  await expect
    .poll(() =>
      edge.evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--echo-voice").trim()
      )
    )
    .toBe("1");
});

test("the edge's threads quicken with a louder voice and settle back to their drift while transcribing", async ({
  page,
}) => {
  await page.goto(overlayUrl);
  await waitForTauriListener(page, "show-overlay");
  await waitForTauriListener(page, "mic-level");
  await emitTauriEvent(page, "show-overlay", "recording");
  const thread = page.locator(".echo-island-edge-rim > span").first();
  const tempo = () =>
    thread.evaluate(
      (element) => element.getAnimations()[0]?.playbackRate ?? Number.NaN
    );

  await emitTauriEvent(page, "mic-level", [0.9]);
  await expect.poll(tempo).toBeGreaterThan(1.8);
  await emitTauriEvent(page, "mic-level", [0]);
  await expect.poll(tempo).toBeLessThan(0.8);
  await emitTauriEvent(page, "show-overlay", "transcribing");
  await expect.poll(tempo).toBe(1);
});

test("releasing keeps the words in place while the finish button bows out", async ({
  page,
}) => {
  await page.goto(overlayUrl);
  await waitForTauriListener(page, "show-overlay");
  await waitForTauriListener(page, "transcription-progress");
  await emitTauriEvent(page, "show-overlay", "recording");
  await emitTauriEvent(page, "transcription-progress", "Hello there");
  const words = page.locator(".echo-island-activity output");
  await expect(words).toHaveText("Hello there");
  await words.evaluate((node) => node.setAttribute("data-kept", ""));

  await emitTauriEvent(page, "show-overlay", "transcribing");
  await expect(
    page.getByRole("button", { name: "Finish recording and transcribe" })
  ).toHaveCount(0);
  await expect(words).toHaveAttribute("data-kept", "");
  await expect(words).toHaveText("Hello there");
});

test("the finish button waits out the model load, then ripples with the voice even once words arrive", async ({
  page,
}) => {
  await page.goto(overlayUrl);
  await waitForTauriListener(page, "show-overlay");
  await waitForTauriListener(page, "mic-level");
  await emitTauriEvent(page, "show-overlay", "preparing");

  const pending = page.getByRole("button", { name: "Preparing local model…" });
  await expect(pending).toBeDisabled();
  await expect(page.locator(".echo-island-activity")).toHaveAttribute(
    "data-has-text",
    "false"
  );
  const mark = page.locator(".echo-island-activity-submit .echo-finish-mark");
  const track = mark.locator(".echo-finish-mark-track");
  const live = mark.locator(".echo-finish-mark-live");
  await expect(mark).toHaveAttribute("data-stage", "loading");
  await expect(track).toHaveCSS("opacity", "0.18");
  await expect(live).toHaveCSS("opacity", "0");
  const dashOffset = () =>
    mark
      .locator(".echo-finish-mark-loader")
      .evaluate((path) => getComputedStyle(path).strokeDashoffset);
  const orbitStart = await dashOffset();
  await expect.poll(dashOffset).not.toBe(orbitStart);
  await mark.evaluate((node) => node.setAttribute("data-kept", ""));

  await emitTauriEvent(page, "show-overlay", "recording");
  await expect(
    page.getByRole("button", { name: "Finish recording and transcribe" })
  ).toBeEnabled();
  await expect(mark).toHaveAttribute("data-stage", "wave");
  await expect(track).toHaveCSS("opacity", "0");
  await expect(live).toHaveCSS("opacity", "1");

  await emitTauriEvent(page, "mic-level", [0.9]);
  await emitTauriEvent(page, "transcription-progress", "Hello there");
  await page.waitForTimeout(1200);
  await expect(mark).toHaveAttribute("data-stage", "wave");
  await expect(mark).toHaveAttribute("data-kept", "");
});

test("a pause after words offers the check, and speaking again brings the wave back", async ({
  page,
}) => {
  await page.goto(overlayUrl);
  await waitForTauriListener(page, "show-overlay");
  await waitForTauriListener(page, "mic-level");
  await emitTauriEvent(page, "show-overlay", "recording");
  const mark = page.locator(".echo-finish-mark");

  await emitTauriEvent(page, "mic-level", [0.9]);
  await emitTauriEvent(page, "mic-level", [0]);
  await page.waitForTimeout(1200);
  await expect(mark).toHaveAttribute("data-stage", "wave");

  await emitTauriEvent(page, "transcription-progress", "Hello there");
  await expect(mark).toHaveAttribute("data-stage", "check");

  await emitTauriEvent(page, "mic-level", [0.9]);
  await expect(mark).toHaveAttribute("data-stage", "wave");
  await emitTauriEvent(page, "mic-level", [0]);
  expect(await mark.getAttribute("data-stage")).toBe("wave");
  await expect(mark).toHaveAttribute("data-stage", "check");
});

test("pointing at the island offers the check, whether hover comes from WebKit or macOS", async ({
  page,
}) => {
  await page.goto(overlayUrl);
  await waitForTauriListener(page, "show-overlay");
  await waitForTauriListener(page, "overlay-pointer");
  await emitTauriEvent(page, "show-overlay", "recording");
  const mark = page.locator(".echo-finish-mark");
  const island = page.locator(".echo-island-hud");
  await expect(mark).toHaveAttribute("data-stage", "wave");

  await island.hover({ position: { x: 8, y: 8 } });
  await expect(mark).toHaveAttribute("data-stage", "check");
  await page.mouse.move(0, 0);
  await expect(mark).toHaveAttribute("data-stage", "wave");

  const box = await requiredBox(island);
  await emitTauriEvent(page, "overlay-pointer", {
    inside: true,
    x: box.x + 8,
    y: box.y + box.height / 2,
  });
  await expect(mark).toHaveAttribute("data-stage", "check");
  await pointNative(page, false);
  await expect(mark).toHaveAttribute("data-stage", "wave");
});

test("on a notched Mac, pointing at either side of the notch offers the check", async ({
  page,
}) => {
  await page.goto(overlayUrl);
  await setOverlayNotch(page, { centerOffset: 0, topInset: 32, width: 196 });
  await waitForTauriListener(page, "show-overlay");
  await waitForTauriListener(page, "overlay-pointer");
  await emitTauriEvent(page, "show-overlay", "recording");
  const mark = page.locator(".echo-finish-mark");
  await expect(mark).toHaveAttribute("data-stage", "wave");
  await settledFrame(page.locator('[data-component="echo-island-morph"]'));

  for (const side of ["left", "right"]) {
    const flank = await requiredBox(
      page.locator(`.echo-island-hud-flank[data-side="${side}"]`)
    );
    await emitTauriEvent(page, "overlay-pointer", {
      inside: true,
      x: flank.x + 2,
      y: flank.y + flank.height / 2,
    });
    await expect(mark).toHaveAttribute("data-stage", "check");
    await pointNative(page, false);
    await expect(mark).toHaveAttribute("data-stage", "wave");
  }
});

test("the finish button's loader holds still under reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(overlayUrl);
  await waitForTauriListener(page, "show-overlay");
  await emitTauriEvent(page, "show-overlay", "preparing");

  const stroke = page.locator(".echo-finish-mark-loader");
  const dashOffset = () =>
    stroke.evaluate((path) => getComputedStyle(path).strokeDashoffset);
  const before = await dashOffset();
  await page.waitForTimeout(300);
  expect(await dashOffset()).toBe(before);
});

test("the listening wave holds its place under reduced motion yet still swells with the voice", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(overlayUrl);
  await waitForTauriListener(page, "show-overlay");
  await waitForTauriListener(page, "mic-level");
  await emitTauriEvent(page, "show-overlay", "recording");

  const wave = page.locator(".echo-finish-mark-live");
  await expect(wave).toHaveCSS("opacity", "1");
  const shape = () => wave.evaluate((path) => path.getAttribute("d"));
  const quiet = await shape();
  await page.waitForTimeout(300);
  expect(await shape()).toBe(quiet);

  await emitTauriEvent(page, "mic-level", [0.9]);
  await expect.poll(shape).not.toBe(quiet);
});
