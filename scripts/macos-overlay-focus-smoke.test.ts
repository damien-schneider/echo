import { expect, test } from "bun:test";
import { file } from "bun";

const smokeSource = await file(
  new URL("./macos-overlay-focus-smoke.swift", import.meta.url)
).text();

test("resident-canvas smoke verifies passive hover and Chat resizing", () => {
  expect(smokeSource).toContain(
    "let residentCanvasSize = CGSize(width: 154, height: 48)"
  );
  expect(smokeSource).toContain(
    "let chatCanvasSize = CGSize(width: 680, height: 620)"
  );
  expect(smokeSource).toContain("waitForAccessibleElement");
  expect(smokeSource).toContain("requireStableCanvas");
  expect(smokeSource).toContain(
    "PASS: resident hover and passive clicks preserved foreign-app focus"
  );
  expect(smokeSource).not.toContain("fixedCanvasSize");
  expect(smokeSource).not.toContain("bounds.width >=");
  expect(smokeSource).not.toContain("$0.width <=");
  expect(smokeSource).not.toContain("$0.width <");
});
