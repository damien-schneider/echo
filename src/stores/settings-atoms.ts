import { invoke } from "@tauri-apps/api/core";
import { atom } from "jotai";
import type { AudioDevice, Settings } from "../lib/types";

// Constants
const DEFAULT_SETTINGS: Partial<Settings> = {
  always_on_microphone: false,
  audio_feedback: true,
  audio_feedback_volume: 1.0,
  sound_theme: "marimba",
  start_hidden: false,
  autostart_enabled: false,
  push_to_talk: false,
  selected_microphone: "Default",
  clamshell_microphone: "Default",
  selected_output_device: "Default",
  translate_to_english: false,
  selected_language: "auto",
  overlay_position: "bottom",
  debug_mode: false,
  beta_features_enabled: false,
  debug_logging_enabled: false,
  log_level: 2,
  custom_words: [],
  history_limit: 5,
  recording_retention_period: "preserve_limit",
  mute_while_recording: false,
};

const DEFAULT_AUDIO_DEVICE: AudioDevice = {
  index: "default",
  name: "Default",
  is_default: true,
};

const settingUpdaters: {
  [K in keyof Settings]?: (value: Settings[K]) => Promise<unknown>;
} = {
  always_on_microphone: (value) =>
    invoke("update_microphone_mode", { alwaysOn: value }),
  audio_feedback: (value) =>
    invoke("change_audio_feedback_setting", { enabled: value }),
  audio_feedback_volume: (value) =>
    invoke("change_audio_feedback_volume_setting", { volume: value }),
  sound_theme: (value) =>
    invoke("change_sound_theme_setting", { theme: value }),
  start_hidden: (value) =>
    invoke("change_start_hidden_setting", { enabled: value }),
  autostart_enabled: (value) =>
    invoke("change_autostart_setting", { enabled: value }),
  push_to_talk: (value) => invoke("change_ptt_setting", { enabled: value }),
  selected_microphone: (value) =>
    invoke("set_selected_microphone", {
      deviceName: value === "Default" ? "default" : value,
    }),
  clamshell_microphone: (value) =>
    invoke("set_clamshell_microphone", {
      deviceName: value === "Default" ? "default" : value,
    }),
  selected_output_device: (value) =>
    invoke("set_selected_output_device", {
      deviceName: value === "Default" ? "default" : value,
    }),
  translate_to_english: (value) =>
    invoke("change_translate_to_english_setting", { enabled: value }),
  selected_language: (value) =>
    invoke("change_selected_language_setting", { language: value }),
  overlay_position: (value) =>
    invoke("change_overlay_position_setting", { position: value }),
  debug_mode: (value) =>
    invoke("change_debug_mode_setting", { enabled: value }),
  beta_features_enabled: (value) =>
    invoke("change_beta_features_setting", { enabled: value }),
  debug_logging_enabled: (value) =>
    invoke("change_debug_logging_setting", { enabled: value }),
  log_level: (value) => invoke("set_log_level", { level: value }),
  custom_words: (value) => invoke("update_custom_words", { words: value }),
  word_correction_threshold: (value) =>
    invoke("change_word_correction_threshold_setting", { threshold: value }),
  paste_method: (value) =>
    invoke("change_paste_method_setting", { method: value }),
  clipboard_handling: (value) =>
    invoke("change_clipboard_handling_setting", { handling: value }),
  history_limit: (value) => invoke("update_history_limit", { limit: value }),
  recording_retention_period: (value) =>
    invoke("update_recording_retention_period", { period: value }),
  post_process_selected_prompt_id: (value) =>
    invoke("set_post_process_selected_prompt", { id: value }),
  mute_while_recording: (value) =>
    invoke("change_mute_while_recording_setting", { enabled: value }),
  input_tracking_enabled: (value) =>
    invoke("change_input_tracking_setting", { enabled: value }),
  input_tracking_excluded_apps: (value) =>
    invoke("change_input_tracking_excluded_apps", { apps: value }),
};

// State Atoms
export const settingsAtom = atom<Settings | null>(null);
export const isLoadingAtom = atom<boolean>(true);
export const isUpdatingAtom = atom<Record<string, boolean>>({});
export const audioDevicesAtom = atom<AudioDevice[]>([]);
export const outputDevicesAtom = atom<AudioDevice[]>([]);
export const customSoundsAtom = atom<{ start: boolean; stop: boolean }>({
  start: false,
  stop: false,
});
export const postProcessModelOptionsAtom = atom<Record<string, string[]>>({});

// Action Atoms
export const refreshSettingsAtom = atom(null, async (get, set) => {
  try {
    const { load } = await import("@tauri-apps/plugin-store");
    const store = await load("settings_store.json", {
      defaults: DEFAULT_SETTINGS,
      autoSave: false,
    });
    const settings = (await store.get("settings")) as Settings;

    const [
      microphoneMode,
      selectedMicrophone,
      clamshellMicrophone,
      selectedOutputDevice,
    ] = await Promise.allSettled([
      invoke("get_microphone_mode"),
      invoke("get_selected_microphone"),
      invoke("get_clamshell_microphone"),
      invoke("get_selected_output_device"),
    ]);

    let mergedSettings: Settings = {
      ...settings,
      always_on_microphone:
        microphoneMode.status === "fulfilled"
          ? (microphoneMode.value as boolean)
          : false,
      selected_microphone:
        selectedMicrophone.status === "fulfilled"
          ? (selectedMicrophone.value as string)
          : "Default",
      clamshell_microphone:
        clamshellMicrophone.status === "fulfilled"
          ? (clamshellMicrophone.value as string)
          : "Default",
      selected_output_device:
        selectedOutputDevice.status === "fulfilled"
          ? (selectedOutputDevice.value as string)
          : "Default",
    };

    if (import.meta.env.DEV && !mergedSettings.debug_mode) {
      mergedSettings = {
        ...mergedSettings,
        debug_mode: true,
      };
    }

    set(settingsAtom, mergedSettings);
    set(isLoadingAtom, false);
  } catch (error) {
    console.error("Failed to load settings:", error);
    set(isLoadingAtom, false);
  }
});

export const refreshAudioDevicesAtom = atom(null, async (_get, set) => {
  try {
    const devices: AudioDevice[] = await invoke("get_available_microphones");
    const devicesWithDefault = [
      DEFAULT_AUDIO_DEVICE,
      ...devices.filter((d) => d.name !== "Default" && d.name !== "default"),
    ];
    set(audioDevicesAtom, devicesWithDefault);
  } catch (error) {
    console.error("Failed to load audio devices:", error);
    set(audioDevicesAtom, [DEFAULT_AUDIO_DEVICE]);
  }
});

export const refreshOutputDevicesAtom = atom(null, async (_get, set) => {
  try {
    const devices: AudioDevice[] = await invoke("get_available_output_devices");
    const devicesWithDefault = [
      DEFAULT_AUDIO_DEVICE,
      ...devices.filter((d) => d.name !== "Default" && d.name !== "default"),
    ];
    set(outputDevicesAtom, devicesWithDefault);
  } catch (error) {
    console.error("Failed to load output devices:", error);
    set(outputDevicesAtom, [DEFAULT_AUDIO_DEVICE]);
  }
});

export const checkCustomSoundsAtom = atom(null, async (_get, set) => {
  try {
    const sounds = await invoke("check_custom_sounds");
    set(customSoundsAtom, sounds as { start: boolean; stop: boolean });
  } catch (error) {
    console.error("Failed to check custom sounds:", error);
  }
});

export const initializeAtom = atom(null, async (get, set) => {
  await Promise.all([
    set(refreshSettingsAtom),
    set(refreshAudioDevicesAtom),
    set(refreshOutputDevicesAtom),
    set(checkCustomSoundsAtom),
  ]);
});

export const updateSettingAtom = atom(
  null,
  async <K extends keyof Settings>(
    get: any,
    set: any,
    key: K,
    value: Settings[K]
  ) => {
    const settings = get(settingsAtom);
    const updateKey = String(key);
    const originalValue = settings?.[key];

    set(isUpdatingAtom, (prev: any) => ({ ...prev, [updateKey]: true }));

    try {
      set(settingsAtom, (prev: any) =>
        prev ? { ...prev, [key]: value } : null
      );

      const updater = settingUpdaters[key];
      if (updater) {
        await updater(value);
      } else if (key !== "bindings" && key !== "selected_model") {
        console.warn(`No handler for setting: ${String(key)}`);
      }
    } catch (error) {
      console.error(`Failed to update setting ${String(key)}:`, error);
      if (settings) {
        set(settingsAtom, (prev: any) =>
          prev ? { ...prev, [key]: originalValue } : null
        );
      }
    } finally {
      set(isUpdatingAtom, (prev: any) => ({ ...prev, [updateKey]: false }));
    }
  }
);

export const resetSettingAtom = atom(
  null,
  async (get, set, key: keyof Settings) => {
    const defaultValue = DEFAULT_SETTINGS[key];
    if (defaultValue !== undefined) {
      await set(updateSettingAtom, key, defaultValue);
    }
  }
);

export const updateBindingAtom = atom(
  null,
  async (get, set, id: string, binding: string) => {
    const settings = get(settingsAtom);
    const updateKey = `binding_${id}`;
    const originalBinding = settings?.bindings?.[id]?.current_binding;

    set(isUpdatingAtom, (prev: any) => ({ ...prev, [updateKey]: true }));

    try {
      // Optimistic update
      set(settingsAtom, (prev: any) =>
        prev
          ? {
              ...prev,
              bindings: {
                ...prev.bindings,
                [id]: {
                  ...prev.bindings[id],
                  current_binding: binding,
                },
              },
            }
          : null
      );

      await invoke("change_binding", { id, binding });
    } catch (error) {
      console.error(`Failed to update binding ${id}:`, error);

      // Rollback on error
      if (originalBinding && settings) {
        set(settingsAtom, (prev: any) =>
          prev
            ? {
                ...prev,
                bindings: {
                  ...prev.bindings,
                  [id]: {
                    ...prev.bindings[id],
                    current_binding: originalBinding,
                  },
                },
              }
            : null
        );
      }
    } finally {
      set(isUpdatingAtom, (prev: any) => ({ ...prev, [updateKey]: false }));
    }
  }
);

export const resetBindingAtom = atom(null, async (get, set, id: string) => {
  const updateKey = `binding_${id}`;
  set(isUpdatingAtom, (prev: any) => ({ ...prev, [updateKey]: true }));

  try {
    await invoke("reset_binding", { id });
    await set(refreshSettingsAtom);
  } catch (error) {
    console.error(`Failed to reset binding ${id}:`, error);
  } finally {
    set(isUpdatingAtom, (prev: any) => ({ ...prev, [updateKey]: false }));
  }
});

export const setPostProcessProviderAtom = atom(
  null,
  async (get, set, providerId: string) => {
    const settings = get(settingsAtom);
    const updateKey = "post_process_provider_id";
    const previousId = settings?.post_process_provider_id ?? null;

    set(isUpdatingAtom, (prev: any) => ({ ...prev, [updateKey]: true }));

    if (settings) {
      set(settingsAtom, (prev: any) =>
        prev ? { ...prev, post_process_provider_id: providerId } : null
      );
    }

    try {
      await invoke("set_post_process_provider", { providerId });
      await set(refreshSettingsAtom);
      // Auto-fetch models for the new provider
      await set(fetchPostProcessModelsAtom, providerId);
    } catch (error) {
      console.error("Failed to set post-process provider:", error);
      if (previousId !== null) {
        set(settingsAtom, (prev: any) =>
          prev ? { ...prev, post_process_provider_id: previousId } : null
        );
      }
    } finally {
      set(isUpdatingAtom, (prev: any) => ({ ...prev, [updateKey]: false }));
    }
  }
);

export const updatePostProcessSettingAtom = atom(
  null,
  async (
    get,
    set,
    settingType: "base_url" | "api_key" | "model",
    providerId: string,
    value: string
  ) => {
    const updateKey = `post_process_${settingType}:${providerId}`;

    const commandMap = {
      base_url: "change_post_process_base_url_setting",
      api_key: "change_post_process_api_key_setting",
      model: "change_post_process_model_setting",
    };

    const paramMap = {
      base_url: "baseUrl",
      api_key: "apiKey",
      model: "model",
    };

    set(isUpdatingAtom, (prev: any) => ({ ...prev, [updateKey]: true }));

    try {
      await invoke(commandMap[settingType], {
        providerId,
        [paramMap[settingType]]: value,
      });
      await set(refreshSettingsAtom);
    } catch (error) {
      console.error(
        `Failed to update post-process ${settingType.replace("_", " ")}:`,
        error
      );
    } finally {
      set(isUpdatingAtom, (prev: any) => ({ ...prev, [updateKey]: false }));
    }
  }
);

export const updatePostProcessApiKeyAtom = atom(
  null,
  async (get, set, providerId: string, apiKey: string) => {
    set(postProcessModelOptionsAtom, (prev) => ({
      ...prev,
      [providerId]: [],
    }));
    await set(updatePostProcessSettingAtom, "api_key", providerId, apiKey);
  }
);

export const fetchPostProcessModelsAtom = atom(
  null,
  async (get, set, providerId: string) => {
    const updateKey = `post_process_models_fetch:${providerId}`;
    set(isUpdatingAtom, (prev: any) => ({ ...prev, [updateKey]: true }));

    try {
      const models: string[] = await invoke("fetch_post_process_models", {
        providerId,
      });
      set(postProcessModelOptionsAtom, (prev) => ({
        ...prev,
        [providerId]: models,
      }));
      return models;
    } catch (error) {
      console.error("Failed to fetch models:", error);
      return [];
    } finally {
      set(isUpdatingAtom, (prev: any) => ({ ...prev, [updateKey]: false }));
    }
  }
);

export const playTestSoundAtom = atom(
  null,
  async (_get, _set, soundType: "start" | "stop") => {
    try {
      await invoke("play_test_sound", { soundType });
    } catch (error) {
      console.error(`Failed to play test sound (${soundType}):`, error);
    }
  }
);
