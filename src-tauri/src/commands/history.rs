use crate::managers::history::{HistoryEntry, HistoryManager};
use crate::managers::transcription::TranscriptionManager;
use crate::managers::tts::TtsManager;
use crate::settings::get_settings;
use std::sync::Arc;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn get_history_entries(
    _app: AppHandle,
    history_manager: State<'_, Arc<HistoryManager>>,
) -> Result<Vec<HistoryEntry>, String> {
    history_manager
        .get_history_entries()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn toggle_history_entry_saved(
    _app: AppHandle,
    history_manager: State<'_, Arc<HistoryManager>>,
    id: i64,
) -> Result<(), String> {
    history_manager
        .toggle_saved_status(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_audio_file_path(
    _app: AppHandle,
    history_manager: State<'_, Arc<HistoryManager>>,
    file_name: String,
) -> Result<String, String> {
    let path = history_manager.get_audio_file_path(&file_name);
    path.to_str()
        .ok_or_else(|| "Invalid file path".to_string())
        .map(|s| s.to_string())
}

#[tauri::command]
pub async fn delete_history_entry(
    _app: AppHandle,
    history_manager: State<'_, Arc<HistoryManager>>,
    id: i64,
) -> Result<(), String> {
    history_manager
        .delete_entry(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn retranscribe_history_entry(
    _app: AppHandle,
    history_manager: State<'_, Arc<HistoryManager>>,
    transcription_manager: State<'_, Arc<TranscriptionManager>>,
    id: i64,
) -> Result<String, String> {
    // Get the history entry to find the audio file
    let entry = history_manager
        .get_entry_by_id(id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("History entry not found: {}", id))?;

    // Load audio samples from the WAV file
    let audio_samples = history_manager
        .load_audio_for_entry(&entry.file_name)
        .map_err(|e| format!("Failed to load audio file: {}", e))?;

    // Ensure model is loaded
    transcription_manager.initiate_model_load();

    // Transcribe the audio
    let new_transcription = transcription_manager
        .transcribe(audio_samples)
        .map_err(|e| format!("Transcription failed: {}", e))?;

    // Update the history entry with the new transcription
    history_manager
        .retranscribe_entry(id, new_transcription.clone())
        .await
        .map_err(|e| format!("Failed to update history entry: {}", e))?;

    Ok(new_transcription)
}

#[tauri::command]
pub async fn update_history_limit(
    app: AppHandle,
    history_manager: State<'_, Arc<HistoryManager>>,
    limit: usize,
) -> Result<(), String> {
    let mut settings = crate::settings::get_settings(&app);
    settings.history_limit = limit;
    crate::settings::write_settings(&app, settings);

    history_manager
        .cleanup_old_entries()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn update_recording_retention_period(
    app: AppHandle,
    history_manager: State<'_, Arc<HistoryManager>>,
    period: String,
) -> Result<(), String> {
    use crate::settings::RecordingRetentionPeriod;

    let retention_period = match period.as_str() {
        "never" => RecordingRetentionPeriod::Never,
        "preserve_limit" => RecordingRetentionPeriod::PreserveLimit,
        "days3" => RecordingRetentionPeriod::Days3,
        "weeks2" => RecordingRetentionPeriod::Weeks2,
        "months3" => RecordingRetentionPeriod::Months3,
        _ => return Err(format!("Invalid retention period: {}", period)),
    };

    let mut settings = crate::settings::get_settings(&app);
    settings.recording_retention_period = retention_period;
    crate::settings::write_settings(&app, settings);

    history_manager
        .cleanup_old_entries()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn reprocess_history_entry(
    app: AppHandle,
    history_manager: State<'_, Arc<HistoryManager>>,
    tts_manager: State<'_, Arc<TtsManager>>,
    id: i64,
) -> Result<String, String> {
    use log::{error, info};

    // Get the history entry
    let entry = history_manager
        .get_entry_by_id(id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("History entry not found: {}", id))?;

    // Use the original transcription text for reprocessing
    let transcription = &entry.transcription_text;

    let settings = get_settings(&app);
    let mut final_text = transcription.clone();
    let mut post_processed_text: Option<String> = None;
    let mut post_process_prompt: Option<String> = None;

    // Try post-processing
    if let Some(processed_text) =
        crate::actions::maybe_post_process_transcription(&settings, transcription).await
    {
        final_text = processed_text.clone();
        post_processed_text = Some(processed_text);

        // Get the prompt that was used
        if let Some(prompt_id) = &settings.post_process_selected_prompt_id {
            if let Some(prompt) = settings
                .post_process_prompts
                .iter()
                .find(|p| &p.id == prompt_id)
            {
                post_process_prompt = Some(prompt.prompt.clone());
            }
        }
    }

    // Update the history entry with the new post-processed text
    history_manager
        .update_post_processed_text(id, post_processed_text.clone(), post_process_prompt)
        .await
        .map_err(|e| format!("Failed to update history entry: {}", e))?;

    // Trigger TTS if enabled and post-processing was successful
    if settings.tts_enabled && post_processed_text.is_some() {
        let tts_manager_clone = Arc::clone(&tts_manager);
        let text_to_speak = final_text.clone();
        info!("Triggering TTS for reprocessed text: {}", text_to_speak);
        std::thread::spawn(move || {
            if let Err(e) = tts_manager_clone.speak(&text_to_speak) {
                error!("TTS failed: {}", e);
            }
        });
    }

    Ok(final_text)
}
