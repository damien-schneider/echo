import { beforeEach, describe, expect, it, mock } from "bun:test";
import { toast } from "sonner";

const settingsAtLaunch = {
  bindings: {
    transcribe: {
      current_binding: "option+space",
      default_binding: "option+space",
      description: "Start and stop dictation",
      id: "transcribe",
      name: "Transcribe",
    },
  },
  history_limit: 5,
  push_to_talk: false,
};

type Command = (args: Record<string, unknown>) => Promise<unknown>;

let saved = settingsAtLaunch;
let savedIsReadable = true;
let commands: Record<string, Command> = {};

mock.module("@tauri-apps/api/core", () => ({
  invoke: (command: string, args: Record<string, unknown> = {}) =>
    commands[command]?.(args) ?? Promise.resolve(null),
}));

mock.module("@tauri-apps/plugin-store", () => ({
  load: () =>
    Promise.resolve({
      get: () =>
        savedIsReadable
          ? Promise.resolve(saved)
          : Promise.reject(new Error("settings file is unreadable")),
    }),
}));

// a static import would load the store before the Tauri mocks exist
const { useSettingsStore } = await import("@/stores/settings-store");

const refuse = (command: string, reason: string) => {
  commands[command] = () => Promise.reject(reason);
};

const shown = () => useSettingsStore.getState().settings;

const shownCombo = () => shown()?.bindings.transcribe?.current_binding;

const announcements = () =>
  toast
    .getToasts()
    .flatMap((entry) =>
      "title" in entry
        ? [{ description: entry.description, title: entry.title }]
        : []
    );

beforeEach(async () => {
  commands = {};
  saved = settingsAtLaunch;
  savedIsReadable = true;
  toast.dismiss();
  await useSettingsStore.getState().refreshSettings();
});

describe("settings store shortcuts", () => {
  it("keeps the previous combo on screen and says why when a new shortcut is refused", async () => {
    const reason = "'option+1' is already the Polish shortcut";
    refuse("change_binding", reason);

    await useSettingsStore.getState().updateBinding("transcribe", "option+1");

    expect(shownCombo()).toBe("option+space");
    expect(announcements()).toEqual([
      { description: reason, title: "Shortcut not changed" },
    ]);
  });

  it("shows the combo as the app stored it once it is accepted", async () => {
    commands.change_binding = () => Promise.resolve("ctrl+space");

    await useSettingsStore.getState().updateBinding("transcribe", "space+ctrl");

    expect(shownCombo()).toBe("ctrl+space");
    expect(announcements()).toEqual([]);
  });

  it("says why when a shortcut cannot be reset", async () => {
    const reason = "Couldn't register shortcut 'option+space': already in use";
    refuse("reset_binding", reason);

    await useSettingsStore.getState().resetBinding("transcribe");

    expect(shownCombo()).toBe("option+space");
    expect(announcements()).toEqual([
      { description: reason, title: "Shortcut not changed" },
    ]);
  });
});

describe("settings store changes", () => {
  it("says why a change was refused and shows the saved value again", async () => {
    const reason = "Push to talk could not be turned on";
    refuse("change_ptt_setting", reason);

    await useSettingsStore.getState().updateSetting("push_to_talk", true);

    expect(shown()?.push_to_talk).toBe(false);
    expect(announcements()).toEqual([
      { description: reason, title: "Setting not applied" },
    ]);
  });

  it("shows what the backend kept when it saved a change before failing", async () => {
    commands.update_history_limit = ({ limit }) => {
      saved = { ...saved, history_limit: Number(limit) };
      return Promise.reject("Old recordings could not be deleted");
    };

    await useSettingsStore.getState().updateSetting("history_limit", 20);

    expect(shown()?.history_limit).toBe(20);
  });

  it("keeps the latest choice when an earlier change to the same setting is refused late", async () => {
    const firstAnswer = Promise.withResolvers<null>();
    const lastAnswer = Promise.withResolvers<null>();
    const answers = [
      firstAnswer.promise,
      Promise.resolve(null),
      lastAnswer.promise,
    ];
    commands.change_ptt_setting = () =>
      answers.shift() ?? Promise.resolve(null);
    const { updateSetting } = useSettingsStore.getState();

    const firstChange = updateSetting("push_to_talk", true);
    const secondChange = updateSetting("push_to_talk", false);
    const lastChange = updateSetting("push_to_talk", true);
    firstAnswer.reject("Push to talk could not be turned on");
    await firstChange;
    saved = { ...saved, push_to_talk: true };
    lastAnswer.resolve(null);
    await Promise.all([secondChange, lastChange]);

    expect(shown()?.push_to_talk).toBe(true);
  });

  it("shows the saved value when two overlapping changes are both refused", async () => {
    refuse("update_history_limit", "History is locked");
    const { updateSetting } = useSettingsStore.getState();

    await Promise.all([
      updateSetting("history_limit", 10),
      updateSetting("history_limit", 20),
    ]);

    expect(shown()?.history_limit).toBe(5);
  });

  it("goes back to the value shown before a refused change when the saved settings cannot be read", async () => {
    refuse("change_ptt_setting", "Push to talk could not be turned on");
    savedIsReadable = false;

    await useSettingsStore.getState().updateSetting("push_to_talk", true);

    expect(shown()?.push_to_talk).toBe(false);
  });
});
