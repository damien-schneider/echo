import { describe, expect, test } from "bun:test";
import {
  hoverChainAt,
  hoverPaint,
} from "@/features/overlay-controls/runtime/native-hover";

const element = (name: string) => ({ name }) as unknown as Element;

describe("native hover", () => {
  test("a pointer outside the panel hovers nothing", () => {
    const document = { elementsFromPoint: () => [element("button")] };

    expect(hoverChainAt(document, { inside: false, x: 10, y: 10 })).toEqual([]);
  });

  test("hover follows the whole stack under the pointer, as CSS would", () => {
    const chain = [element("button"), element("panel")];
    const document = { elementsFromPoint: () => chain };

    expect(hoverChainAt(document, { inside: true, x: 10, y: 10 })).toEqual(
      chain
    );
  });

  test("only the elements that changed are repainted", () => {
    const button = element("button");
    const panel = element("panel");
    const other = element("other");

    expect(hoverPaint([button, panel], [other, panel])).toEqual({
      enter: [other],
      leave: [button],
    });
  });
});
