import { expect, type Page } from "@playwright/test";

const COLOR_HEX = /^#[0-9a-f]{6}$/i;

function linearChannel(hex: string) {
  const channel = Number.parseInt(hex, 16) / 255;
  return channel <= 0.040_45
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string) {
  if (!COLOR_HEX.test(color)) {
    throw new Error(`Expected resolved skin color, got ${color}`);
  }
  return (
    0.2126 * linearChannel(color.slice(1, 3)) +
    0.7152 * linearChannel(color.slice(3, 5)) +
    0.0722 * linearChannel(color.slice(5, 7))
  );
}

export async function expectSkinContrast(page: Page) {
  const colors = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(
      [
        "background",
        "card",
        "popover",
        "foreground",
        "muted-foreground",
        "primary",
        "primary-foreground",
        "focus-ring",
        "control-boundary",
      ].map((token) => [token, style.getPropertyValue(`--${token}`).trim()])
    );
  });
  for (const surface of ["background", "card", "popover"]) {
    for (const [token, minimum] of [
      ["foreground", 4.5],
      ["muted-foreground", 4.5],
      ["focus-ring", 3],
      ["control-boundary", 3],
    ] satisfies [string, number][]) {
      const text = colors[token];
      const background = colors[surface];
      if (!(text && background)) {
        throw new Error(`Missing Echo tokens: ${token}, ${surface}`);
      }
      const first = luminance(text);
      const second = luminance(background);
      expect(
        (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05),
        `${token} on ${surface}`
      ).toBeGreaterThanOrEqual(minimum);
    }
  }
  const primary = colors.primary;
  const text = colors["primary-foreground"];
  if (!(primary && text)) {
    throw new Error("Missing primary colors");
  }
  expect(
    (Math.max(luminance(primary), luminance(text)) + 0.05) /
      (Math.min(luminance(primary), luminance(text)) + 0.05)
  ).toBeGreaterThanOrEqual(4.5);
}
