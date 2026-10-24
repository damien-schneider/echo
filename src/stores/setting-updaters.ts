import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "@/lib/types";

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
  double_shift_capture_enabled: (value) =>
    invoke("change_double_shift_capture_setting", { enabled: value }),
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
  meeting_system_audio_enabled: (value) =>
    invoke("change_meeting_system_audio_setting", { enabled: value }),
  mute_while_recording: (value) =>
    invoke("change_mute_while_recording_setting", { enabled: value }),
  overlay_position: (value) =>
    invoke("change_overlay_position_setting", { position: value }),
  paste_method: (value) =>
    invoke("change_paste_method_setting", { method: value }),
  polish_level: (value) =>
    invoke("change_polish_level_setting", { level: value }),
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

export const runSettingUpdater = async <K extends keyof Settings>(
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
