import { invoke } from "@tauri-apps/api/core";
import type { load as LoadFn } from "@tauri-apps/plugin-store";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { AudioDevice, Settings } from "@/lib/types";

let cachedStorePromise: ReturnType<typeof LoadFn> | null = null;
const getSettingsStore = () => {
  if (!cachedStorePromise) {
    cachedStorePromise = import("@tauri-apps/plugin-store").then(({ load }) =>
      load("settings_store.json", {
        autoSave: false,
        defaults: DEFAULT_SETTINGS,
      })
    );
  }
  return cachedStorePromise;
};

const POST_PROCESS_COMMAND_MAP = {
  api_key: "change_post_process_api_key_setting",
  base_url: "change_post_process_base_url_setting",
  model: "change_post_process_model_setting",
} as const;

const POST_PROCESS_PARAM_MAP = {
  api_key: "apiKey",
  base_url: "baseUrl",
  model: "model",
} as const;

const DEFAULT_SETTINGS: Partial<Settings> = {
  always_on_microphone: false,
  audio_feedback: true,
  audio_feedback_volume: 1.0,
  autostart_enabled: false,
  clamshell_microphone: "Default",
  cleanup_app_context_enabled: false,
  cleanup_dictionary: [],
  cleanup_enabled: false,
  custom_words: [],
  debug_logging_enabled: false,
  debug_mode: false,
  history_limit: 5,
  log_level: 2,
  mute_while_recording: false,
  overlay_dock_edge: "right",
  overlay_dock_offset: 0.5,
  overlay_position: "edge",
  push_to_talk: false,
  recording_retention_period: "preserve_limit",
  selected_language: "auto",
  selected_microphone: "Default",
  selected_output_device: "Default",
  sound_theme: "marimba",
  start_hidden: false,
  translate_to_english: false,
  tts_enabled: false,
};

const DEFAULT_AUDIO_DEVICE: AudioDevice = {
  index: "default",
  is_default: true,
  name: "Default",
};

const omitKey = (
  record: Record<string, boolean>,
  key: string
): Record<string, boolean> => {
  const { [key]: _, ...rest } = record;
  return rest;
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
  autostart_enabled: (value) =>
    invoke("change_autostart_setting", { enabled: value }),
  clamshell_microphone: (value) =>
    invoke("set_clamshell_microphone", {
      deviceName: value === "Default" ? "default" : value,
    }),
  cleanup_app_context_enabled: (value) =>
    invoke("change_cleanup_app_context_enabled_setting", { enabled: value }),
  cleanup_dictionary: (value) =>
    invoke("update_cleanup_dictionary", { dictionary: value }),
  cleanup_enabled: (value) =>
    invoke("change_cleanup_enabled_setting", { enabled: value }),
  clipboard_handling: (value) =>
    invoke("change_clipboard_handling_setting", { handling: value }),
  custom_words: (value) => invoke("update_custom_words", { words: value }),
  debug_logging_enabled: (value) =>
    invoke("change_debug_logging_setting", { enabled: value }),
  debug_mode: (value) =>
    invoke("change_debug_mode_setting", { enabled: value }),
  history_limit: (value) => invoke("update_history_limit", { limit: value }),
  input_tracking_enabled: (value) =>
    invoke("change_input_tracking_setting", { enabled: value }),
  input_tracking_excluded_apps: (value) =>
    invoke("change_input_tracking_excluded_apps", { apps: value }),
  log_level: (value) => invoke("set_log_level", { level: value }),
  meeting_auto_summary: (value) =>
    invoke("change_meeting_auto_summary_setting", { enabled: value }),
  meeting_chunk_duration_secs: (value) =>
    invoke("change_meeting_chunk_duration_setting", {
      durationSecs: value,
    }),
  meeting_system_audio_device: (value) =>
    invoke("change_meeting_system_audio_device_setting", { device: value }),
  meeting_system_audio_enabled: (value) =>
    invoke("change_meeting_system_audio_setting", { enabled: value }),
  mute_while_recording: (value) =>
    invoke("change_mute_while_recording_setting", { enabled: value }),
  overlay_position: (value) =>
    invoke("change_overlay_position_setting", { position: value }),
  paste_method: (value) =>
    invoke("change_paste_method_setting", { method: value }),
  post_process_enabled: (value) =>
    invoke("change_post_process_enabled_setting", { enabled: value }),
  post_process_selected_prompt_id: (value) =>
    invoke("set_post_process_selected_prompt", { id: value }),
  push_to_talk: (value) => invoke("change_ptt_setting", { enabled: value }),
  recording_retention_period: (value) =>
    invoke("update_recording_retention_period", { period: value }),
  selected_language: (value) =>
    invoke("change_selected_language_setting", { language: value }),
  selected_microphone: (value) =>
    invoke("set_selected_microphone", {
      deviceName: value === "Default" ? "default" : value,
    }),
  selected_output_device: (value) =>
    invoke("set_selected_output_device", {
      deviceName: value === "Default" ? "default" : value,
    }),
  sound_theme: (value) =>
    invoke("change_sound_theme_setting", { theme: value }),
  start_hidden: (value) =>
    invoke("change_start_hidden_setting", { enabled: value }),
  translate_to_english: (value) =>
    invoke("change_translate_to_english_setting", { enabled: value }),
  tts_enabled: (value) =>
    invoke("change_tts_enabled_setting", { enabled: value }),
  voice_commands_enabled: (value) =>
    invoke("change_voice_commands_enabled_setting", { enabled: value }),
  word_correction_threshold: (value) =>
    invoke("change_word_correction_threshold_setting", { threshold: value }),
};

const runSettingUpdater = async <K extends keyof Settings>(
  key: K,
  value: Settings[K]
) => {
  const updater = settingUpdaters[key];
  if (!updater) {
    return false;
  }
  await updater(value);
  return true;
};

interface SettingsStore {
  audioDevices: AudioDevice[];
  checkCustomSounds: () => Promise<void>;
  checkModelToolSupport: (
    providerId: string,
    model: string
  ) => Promise<boolean | null>;
  customSounds: { start: boolean; stop: boolean };
  fetchPostProcessModels: (providerId: string) => Promise<string[]>;

  initialize: () => Promise<void>;
  isLoading: boolean;
  isUpdating: Record<string, boolean>;
  modelToolSupport: Record<string, boolean | null>;
  outputDevices: AudioDevice[];
  playTestSound: (soundType: "start" | "stop") => Promise<void>;
  postProcessModelOptions: Record<string, string[]>;
  refreshAudioDevices: () => Promise<void>;
  refreshOutputDevices: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  resetBinding: (id: string) => Promise<void>;
  resetSetting: (key: keyof Settings) => Promise<void>;
  setPostProcessProvider: (providerId: string) => Promise<void>;
  settings: Settings | null;
  updateBinding: (id: string, binding: string) => Promise<void>;
  updatePostProcessApiKey: (
    providerId: string,
    apiKey: string
  ) => Promise<void>;
  updatePostProcessSetting: (
    settingType: "base_url" | "api_key" | "model",
    providerId: string,
    value: string
  ) => Promise<void>;
  updateSetting: (
    key: keyof Settings,
    value: Settings[keyof Settings]
  ) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  audioDevices: [],

  checkCustomSounds: async () => {
    try {
      const sounds = await invoke<{ start: boolean; stop: boolean }>(
        "check_custom_sounds"
      );
      set({ customSounds: sounds });
    } catch (error) {
      console.error("Failed to check custom sounds:", error);
    }
  },

  checkModelToolSupport: async (providerId, model) => {
    if (!model.trim()) {
      return null;
    }
    const cacheKey = `${providerId}:${model}`;
    try {
      const result: boolean | null = await invoke("check_model_tool_support", {
        model,
        providerId,
      });
      set((state) => ({
        modelToolSupport: { ...state.modelToolSupport, [cacheKey]: result },
      }));
      return result;
    } catch {
      return null;
    }
  },
  customSounds: { start: false, stop: false },

  fetchPostProcessModels: async (providerId) => {
    const updateKey = `post_process_models_fetch:${providerId}`;
    set((state) => ({
      isUpdating: { ...state.isUpdating, [updateKey]: true },
    }));

    try {
      const models: string[] = await invoke("fetch_post_process_models", {
        providerId,
      });
      set((state) => ({
        postProcessModelOptions: {
          ...state.postProcessModelOptions,
          [providerId]: models,
        },
      }));
      return models;
    } catch (error) {
      console.error("Failed to fetch models:", error);
      return [];
    } finally {
      set((state) => ({ isUpdating: omitKey(state.isUpdating, updateKey) }));
    }
  },

  initialize: async () => {
    // Idempotent: prevents 32 concurrent calls from useSettings consumers.
    const { isLoading } = get();
    if (!isLoading) {
      return;
    }
    set({ isLoading: false });

    const {
      refreshSettings,
      refreshAudioDevices,
      refreshOutputDevices,
      checkCustomSounds,
    } = get();
    await Promise.all([
      refreshSettings(),
      refreshAudioDevices(),
      refreshOutputDevices(),
      checkCustomSounds(),
    ]);
  },
  isLoading: true,
  isUpdating: {},
  modelToolSupport: {},
  outputDevices: [],

  playTestSound: async (soundType) => {
    try {
      await invoke("play_test_sound", { soundType });
    } catch (error) {
      console.error(`Failed to play test sound (${soundType}):`, error);
    }
  },
  postProcessModelOptions: {},

  refreshAudioDevices: async () => {
    try {
      const devices: AudioDevice[] = await invoke("get_available_microphones");
      const devicesWithDefault = [
        DEFAULT_AUDIO_DEVICE,
        ...devices.filter((d) => d.name !== "Default" && d.name !== "default"),
      ];
      set({ audioDevices: devicesWithDefault });
    } catch (error) {
      console.error("Failed to load audio devices:", error);
      set({ audioDevices: [DEFAULT_AUDIO_DEVICE] });
    }
  },

  refreshOutputDevices: async () => {
    try {
      const devices: AudioDevice[] = await invoke(
        "get_available_output_devices"
      );
      const devicesWithDefault = [
        DEFAULT_AUDIO_DEVICE,
        ...devices.filter((d) => d.name !== "Default" && d.name !== "default"),
      ];
      set({ outputDevices: devicesWithDefault });
    } catch (error) {
      console.error("Failed to load output devices:", error);
      set({ outputDevices: [DEFAULT_AUDIO_DEVICE] });
    }
  },

  refreshSettings: async () => {
    try {
      const store = await getSettingsStore();
      const settings = await store.get<Settings>("settings");
      if (!settings) {
        set({ isLoading: false });
        return;
      }

      const [
        microphoneMode,
        selectedMicrophone,
        clamshellMicrophone,
        selectedOutputDevice,
      ] = await Promise.allSettled([
        invoke<boolean>("get_microphone_mode"),
        invoke<string>("get_selected_microphone"),
        invoke<string>("get_clamshell_microphone"),
        invoke<string>("get_selected_output_device"),
      ]);

      let mergedSettings: Settings = {
        ...settings,
        always_on_microphone:
          microphoneMode.status === "fulfilled" ? microphoneMode.value : false,
        clamshell_microphone:
          clamshellMicrophone.status === "fulfilled"
            ? clamshellMicrophone.value
            : "Default",
        selected_microphone:
          selectedMicrophone.status === "fulfilled"
            ? selectedMicrophone.value
            : "Default",
        selected_output_device:
          selectedOutputDevice.status === "fulfilled"
            ? selectedOutputDevice.value
            : "Default",
      };

      if (import.meta.env.DEV && !mergedSettings.debug_mode) {
        mergedSettings = {
          ...mergedSettings,
          debug_mode: true,
        };
      }

      set({ isLoading: false, settings: mergedSettings });
    } catch (error) {
      console.error("Failed to load settings:", error);
      set({ isLoading: false });
    }
  },

  resetBinding: async (id) => {
    const updateKey = `binding_${id}`;
    set((state) => ({
      isUpdating: { ...state.isUpdating, [updateKey]: true },
    }));

    try {
      await invoke("reset_binding", { id });
      await get().refreshSettings();
    } catch (error) {
      console.error(`Failed to reset binding ${id}:`, error);
    } finally {
      set((state) => ({ isUpdating: omitKey(state.isUpdating, updateKey) }));
    }
  },

  resetSetting: async (key) => {
    const defaultValue = DEFAULT_SETTINGS[key];
    if (defaultValue !== undefined) {
      await get().updateSetting(key, defaultValue);
    }
  },

  setPostProcessProvider: async (providerId) => {
    const { settings } = get();
    const updateKey = "post_process_provider_id";
    const previousId = settings?.post_process_provider_id ?? null;

    set((state) => ({
      isUpdating: { ...state.isUpdating, [updateKey]: true },
      ...(state.settings
        ? {
            settings: {
              ...state.settings,
              post_process_provider_id: providerId,
            },
          }
        : {}),
    }));

    try {
      await invoke("set_post_process_provider", { providerId });
      await get().refreshSettings();
      await get().fetchPostProcessModels(providerId);
    } catch (error) {
      console.error("Failed to set post-process provider:", error);
      if (previousId !== null) {
        set((state) => ({
          settings: state.settings
            ? { ...state.settings, post_process_provider_id: previousId }
            : null,
        }));
      }
    } finally {
      set((state) => ({ isUpdating: omitKey(state.isUpdating, updateKey) }));
    }
  },
  settings: null,

  updateBinding: async (id, binding) => {
    const { settings } = get();
    const updateKey = `binding_${id}`;
    const originalBinding = settings?.bindings?.[id]?.current_binding;

    set((state) => {
      if (!state.settings) {
        return { isUpdating: { ...state.isUpdating, [updateKey]: true } };
      }
      const existingBinding = state.settings.bindings[id];
      if (!existingBinding) {
        return { isUpdating: { ...state.isUpdating, [updateKey]: true } };
      }
      return {
        isUpdating: { ...state.isUpdating, [updateKey]: true },
        settings: {
          ...state.settings,
          bindings: {
            ...state.settings.bindings,
            [id]: {
              ...existingBinding,
              current_binding: binding,
            },
          },
        },
      };
    });

    try {
      await invoke("change_binding", { binding, id });
    } catch (error) {
      console.error(`Failed to update binding ${id}:`, error);

      if (originalBinding && settings) {
        set((state) => {
          if (!state.settings) {
            return {};
          }
          const existingBinding = state.settings.bindings[id];
          if (!existingBinding) {
            return {};
          }
          return {
            settings: {
              ...state.settings,
              bindings: {
                ...state.settings.bindings,
                [id]: {
                  ...existingBinding,
                  current_binding: originalBinding,
                },
              },
            },
          };
        });
      }
    } finally {
      set((state) => ({ isUpdating: omitKey(state.isUpdating, updateKey) }));
    }
  },

  updatePostProcessApiKey: async (providerId, apiKey) => {
    set((state) => ({
      postProcessModelOptions: {
        ...state.postProcessModelOptions,
        [providerId]: [],
      },
    }));
    await get().updatePostProcessSetting("api_key", providerId, apiKey);
  },

  updatePostProcessSetting: async (settingType, providerId, value) => {
    const updateKey = `post_process_${settingType}:${providerId}`;

    set((state) => ({
      isUpdating: { ...state.isUpdating, [updateKey]: true },
    }));

    try {
      await invoke(POST_PROCESS_COMMAND_MAP[settingType], {
        providerId,
        [POST_PROCESS_PARAM_MAP[settingType]]: value,
      });
      await get().refreshSettings();
    } catch (error) {
      console.error(
        `Failed to update post-process ${settingType.replace("_", " ")}:`,
        error
      );
    } finally {
      set((state) => ({ isUpdating: omitKey(state.isUpdating, updateKey) }));
    }
  },

  updateSetting: async (key, value) => {
    const { settings } = get();
    const updateKey = String(key);
    const originalValue = settings?.[key];

    set((state) => ({
      isUpdating: { ...state.isUpdating, [updateKey]: true },
      settings: state.settings ? { ...state.settings, [key]: value } : null,
    }));

    try {
      const wasUpdated = await runSettingUpdater(key, value);
      if (!wasUpdated && key !== "bindings") {
        console.warn(`No handler for setting: ${String(key)}`);
      }
    } catch (error) {
      console.error(`Failed to update setting ${String(key)}:`, error);
      if (settings) {
        set((state) => ({
          settings: state.settings
            ? { ...state.settings, [key]: originalValue }
            : null,
        }));
      }
    } finally {
      set((state) => ({ isUpdating: omitKey(state.isUpdating, updateKey) }));
    }
  },
}));

// single-value subscriptions — a whole-store selector cascades re-renders across every consumer

export function useSetting<K extends keyof Settings>(
  key: K
): Settings[K] | undefined {
  return useSettingsStore((s) => s.settings?.[key]);
}

export function useIsSettingUpdating(key: string): boolean {
  return useSettingsStore((s) => Boolean(s.isUpdating[key]));
}

export function useSettingsActions() {
  return useSettingsStore(
    useShallow((s) => ({
      resetBinding: s.resetBinding,
      resetSetting: s.resetSetting,
      updateBinding: s.updateBinding,
      updateSetting: s.updateSetting,
    }))
  );
}
