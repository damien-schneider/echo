import { describe, expect, it } from "bun:test";
import { getKeyName } from "@/lib/utils/keyboard";

describe("recorded key names", () => {
  it("names navigation, lock and numpad keys the way shortcuts are stored", () => {
    expect(getKeyName({ code: "PageDown", key: "PageDown" })).toBe("pagedown");
    expect(getKeyName({ code: "CapsLock", key: "CapsLock" })).toBe("capslock");
    expect(getKeyName({ code: "NumpadAdd", key: "+" })).toBe("numadd");
    expect(getKeyName({ code: "Numpad7", key: "7" })).toBe("num7");
  });

  it("ignores keys the system cannot identify", () => {
    expect(
      getKeyName({ code: "Unidentified", key: "Unidentified" }, "macos")
    ).toBeNull();
  });

  it("names the Meta key command on macOS and super elsewhere", () => {
    expect(getKeyName({ code: "MetaLeft", key: "Meta" }, "macos")).toBe(
      "command"
    );
    expect(getKeyName({ code: "MetaLeft", key: "Meta" }, "windows")).toBe(
      "super"
    );
    expect(getKeyName({ code: "", key: "Meta" }, "windows")).toBe("super");
  });
});
