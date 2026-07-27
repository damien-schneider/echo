use crate::managers::export;
use crate::managers::meeting::{
    ExportFormat, Meeting, MeetingManager, MeetingSegment, MeetingStatus,
};
use std::sync::Arc;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn start_meeting(
    _app: AppHandle,
    meeting_manager: State<'_, Arc<MeetingManager>>,
    title: Option<String>,
) -> Result<i64, String> {
    meeting_manager
        .start_meeting(title)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_meeting(
    _app: AppHandle,
    meeting_manager: State<'_, Arc<MeetingManager>>,
) -> Result<(), String> {
    meeting_manager
        .inner()
        .clone()
        .stop_meeting()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_meeting_status(
    meeting_manager: State<'_, Arc<MeetingManager>>,
) -> Result<MeetingStatus, String> {
    Ok(meeting_manager.get_meeting_status())
}

#[tauri::command]
pub fn get_meeting(
    meeting_manager: State<'_, Arc<MeetingManager>>,
    id: i64,
) -> Result<Meeting, String> {
    meeting_manager.get_meeting(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_meeting_segments(
    meeting_manager: State<'_, Arc<MeetingManager>>,
    meeting_id: i64,
) -> Result<Vec<MeetingSegment>, String> {
    meeting_manager
        .get_meeting_segments(meeting_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_meetings(
    meeting_manager: State<'_, Arc<MeetingManager>>,
) -> Result<Vec<Meeting>, String> {
    meeting_manager.list_meetings().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_meeting(
    meeting_manager: State<'_, Arc<MeetingManager>>,
    id: i64,
) -> Result<(), String> {
    meeting_manager
        .delete_meeting(id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_meeting(
    meeting_manager: State<'_, Arc<MeetingManager>>,
    id: i64,
    format: ExportFormat,
) -> Result<String, String> {
    let meeting = meeting_manager.get_meeting(id).map_err(|e| e.to_string())?;
    let segments = meeting_manager
        .get_meeting_segments(id)
        .map_err(|e| e.to_string())?;
    Ok(export::export(&meeting, &segments, &format))
}

#[tauri::command]
pub fn rename_meeting_speaker(
    meeting_manager: State<'_, Arc<MeetingManager>>,
    meeting_id: i64,
    old_label: String,
    new_label: String,
) -> Result<(), String> {
    meeting_manager
        .rename_speaker(meeting_id, &old_label, &new_label)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn is_system_audio_available() -> bool {
    crate::audio_toolkit::audio::system_capture::is_system_audio_available()
}

#[tauri::command]
pub fn get_meeting_audio_path(
    meeting_manager: State<'_, Arc<MeetingManager>>,
    meeting_id: i64,
) -> Result<Option<String>, String> {
    meeting_manager
        .get_mic_audio_path(meeting_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn retranscribe_meeting(
    _app: AppHandle,
    meeting_manager: State<'_, Arc<MeetingManager>>,
    meeting_id: i64,
) -> Result<(), String> {
    meeting_manager
        .retranscribe_meeting(meeting_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_meeting_transcript_for_summary(
    meeting_manager: State<'_, Arc<MeetingManager>>,
    meeting_id: i64,
) -> Result<String, String> {
    meeting_manager
        .get_transcript_for_summary(meeting_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_meeting_summary(
    app: AppHandle,
    meeting_manager: State<'_, Arc<MeetingManager>>,
    meeting_id: i64,
    summary: String,
) -> Result<(), String> {
    meeting_manager
        .save_summary(&app, meeting_id, &summary)
        .map_err(|e| e.to_string())
}
