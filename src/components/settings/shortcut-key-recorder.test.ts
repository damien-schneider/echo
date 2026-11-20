import { describe, expect, it } from "bun:test";
import { createShortcutKeyRecorder } from "@/components/settings/shortcut-key-recorder";

const nothingHeld = {
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
};

const record = () => {
  const shown: string[][] = [];
  const recorder = createShortcutKeyRecorder((keys) => shown.push(keys));
  return { recorder, shown };
};

describe("recording a shortcut", () => {
  it("records fn+space whichever key is let go first", () => {
    const spaceFirst = record().recorder;
    spaceFirst.press("fn");
    spaceFirst.press("space");
    expect(spaceFirst.release("space", nothingHeld)).toBeNull();
    expect(spaceFirst.release("fn")).toBe("fn+space");

    const fnFirst = record().recorder;
    fnFirst.press("fn");
    fnFirst.press("space");
    expect(fnFirst.release("fn")).toBeNull();
    expect(fnFirst.release("space", nothingHeld)).toBe("fn+space");
  });

  it("records fn on its own", () => {
    const { recorder } = record();
    recorder.press("fn");
    expect(recorder.release("fn")).toBe("fn");
  });

  it("finishes a Command shortcut whose key release macOS never reported", () => {
    const { recorder } = record();
    recorder.press("command");
    recorder.press("a");
    expect(recorder.release("command", nothingHeld)).toBe("command+a");
  });

  it("keeps waiting while a modifier is still held", () => {
    const { recorder } = record();
    recorder.press("ctrl");
    recorder.press("shift");
    recorder.press("d");
    expect(
      recorder.release("d", { ...nothingHeld, ctrlKey: true, shiftKey: true })
    ).toBeNull();
    expect(
      recorder.release("shift", { ...nothingHeld, ctrlKey: true })
    ).toBeNull();
    expect(recorder.release("ctrl", nothingHeld)).toBe("ctrl+shift+d");
  });

  it("shows each key once, in the order it was pressed, and starts over on reset", () => {
    const { recorder, shown } = record();
    recorder.press("ctrl");
    recorder.press("space");
    recorder.press("ctrl");
    expect(shown.at(-1)).toEqual(["ctrl", "space"]);

    recorder.reset();
    expect(shown.at(-1)).toEqual([]);
    recorder.press("option");
    recorder.press("1");
    expect(recorder.release("option", nothingHeld)).toBe("option+1");
  });
});
