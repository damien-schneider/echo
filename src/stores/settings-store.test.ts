import { beforeEach, describe, expect, it, mock } from "bun:test";
import { toast } from "sonner";

const storedSettings = {
  bindings: {
    transcribe: {
      current_binding: "option+space",
      default_binding: "option+space",
      description: "Start and stop dictation",
      id: "transcribe",
      name: "Transcribe",
    },
  },
};

let refusal: string | null = null;

mock.module("@tauri-apps/api/core", () => ({
  invoke: (command: string) =>
    refusal !== null &&
    (command === "change_binding" || command === "reset_binding")
      ? Promise.reject(refusal)
      : Promise.resolve(null),
}));

mock.module("@tauri-apps/plugin-store", () => ({
  load: () => Promise.resolve({ get: () => Promise.resolve(storedSettings) }),
}));

// a static import would load the store before the Tauri mocks exist
const { useSettingsStore } = await import("@/stores/settings-store");

const shownCombo = () =>
  useSettingsStore.getState().settings?.bindings.transcribe?.current_binding;

const announcements = () =>
  toast
    .getToasts()
    .flatMap((entry) =>
      "title" in entry
        ? [{ description: entry.description, title: entry.title }]
        : []
    );

beforeEach(async () => {
  refusal = null;
  toast.dismiss();
  await useSettingsStore.getState().refreshSettings();
});

describe("settings store shortcuts", () => {
  it("keeps the previous combo on screen and says why when a new shortcut is refused", async () => {
    refusal = "'option+1' is already the Polish shortcut";

    await useSettingsStore.getState().updateBinding("transcribe", "option+1");

    expect(shownCombo()).toBe("option+space");
    expect(announcements()).toEqual([
      { description: refusal, title: "Shortcut not changed" },
    ]);
  });

  it("shows the new combo without an error once it is accepted", async () => {
    await useSettingsStore
      .getState()
      .updateBinding("transcribe", "ctrl+shift+d");

    expect(shownCombo()).toBe("ctrl+shift+d");
    expect(announcements()).toEqual([]);
  });

  it("says why when a shortcut cannot be reset", async () => {
    refusal = "Couldn't register shortcut 'option+space': already in use";

    await useSettingsStore.getState().resetBinding("transcribe");

    expect(shownCombo()).toBe("option+space");
    expect(announcements()).toEqual([
      { description: refusal, title: "Shortcut not changed" },
    ]);
  });
});
