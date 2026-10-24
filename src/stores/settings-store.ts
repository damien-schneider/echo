import { invoke } from "@tauri-apps/api/core";
import type { load as LoadFn } from "@tauri-apps/plugin-store";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { AudioDevice, Settings } from "@/lib/types";
import { runSettingUpdater } from "@/stores/setting-updaters";

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
  double_shift_capture_enabled: true,
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

interface SettingsStore {
  audioDevices: AudioDevice[];
  checkCustomSounds: () => Promise<void>;
  customSounds: { start: boolean; stop: boolean };

  initialize: () => Promise<void>;
  isLoading: boolean;
  isUpdating: Record<string, boolean>;
  outputDevices: AudioDevice[];
  playTestSound: (soundType: "start" | "stop") => Promise<void>;
  refreshAudioDevices: () => Promise<void>;
  refreshOutputDevices: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  resetBinding: (id: string) => Promise<void>;
  resetSetting: (key: keyof Settings) => Promise<void>;
  settings: Settings | null;
  updateBinding: (id: string, binding: string) => Promise<void>;
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
  customSounds: { start: false, stop: false },

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
  outputDevices: [],

  playTestSound: async (soundType) => {
    try {
      await invoke("play_test_sound", { soundType });
    } catch (error) {
      console.error(`Failed to play test sound (${soundType}):`, error);
    }
  },

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
