#[cfg(test)]
mod type_tests {
    use super::*;

    #[test]
    fn format_ms_to_hms_zero() {
        assert_eq!(format_ms_to_hms(0), "00:00:00");
    }

    #[test]
    fn format_ms_to_hms_seconds_only() {
        assert_eq!(format_ms_to_hms(5_000), "00:00:05");
    }

    #[test]
    fn format_ms_to_hms_minutes_and_seconds() {
        assert_eq!(format_ms_to_hms(125_000), "00:02:05");
    }

    #[test]
    fn format_ms_to_hms_hours() {
        assert_eq!(format_ms_to_hms(3_661_000), "01:01:01");
    }

    #[test]
    fn format_ms_to_hms_sub_second_truncated() {
        assert_eq!(format_ms_to_hms(1_500), "00:00:01");
    }

    #[test]
    fn format_ms_to_srt_time_zero() {
        assert_eq!(format_ms_to_srt_time(0), "00:00:00,000");
    }

    #[test]
    fn format_ms_to_srt_time_with_millis() {
        assert_eq!(format_ms_to_srt_time(3_661_456), "01:01:01,456");
    }

    #[test]
    fn format_ms_to_srt_time_comma_separator() {
        let result = format_ms_to_srt_time(1_234);
        assert!(result.contains(','), "SRT times must use comma separator");
    }

    #[test]
    fn format_ms_to_vtt_time_zero() {
        assert_eq!(format_ms_to_vtt_time(0), "00:00:00.000");
    }

    #[test]
    fn format_ms_to_vtt_time_with_millis() {
        assert_eq!(format_ms_to_vtt_time(3_661_456), "01:01:01.456");
    }

    #[test]
    fn format_ms_to_vtt_time_dot_separator() {
        let result = format_ms_to_vtt_time(1_234);
        assert!(result.contains('.'), "VTT times must use dot separator");
        assert!(!result.contains(','), "VTT must not use comma separator");
    }

    #[test]
    fn meeting_status_round_trip() {
        let statuses = [
            MeetingStatus::Recording,
            MeetingStatus::Processing,
            MeetingStatus::Recorded,
            MeetingStatus::Complete,
            MeetingStatus::Partial,
            MeetingStatus::Error,
        ];
        for status in &statuses {
            let s = status.as_str();
            let recovered = MeetingStatus::from_str(s);
            assert_eq!(*status, recovered);
        }
    }

    #[test]
    fn meeting_status_unknown_maps_to_error() {
        assert_eq!(MeetingStatus::from_str("unknown"), MeetingStatus::Error);
        assert_eq!(MeetingStatus::from_str(""), MeetingStatus::Error);
    }

    #[test]
    fn meeting_status_serialization() {
        let json = serde_json::to_string(&MeetingStatus::Recording).unwrap();
        assert_eq!(json, "\"recording\"");

        let deserialized: MeetingStatus = serde_json::from_str("\"complete\"").unwrap();
        assert_eq!(deserialized, MeetingStatus::Complete);
    }

    #[test]
    fn audio_source_as_str() {
        assert_eq!(AudioSource::Mic.as_str(), "mic");
        assert_eq!(AudioSource::System.as_str(), "system");
    }

    #[test]
    fn export_format_serialization() {
        let json = serde_json::to_string(&ExportFormat::Srt).unwrap();
        assert_eq!(json, "\"srt\"");

        let md: ExportFormat = serde_json::from_str("\"markdown\"").unwrap();
        assert!(matches!(md, ExportFormat::Markdown));
    }

    #[test]
    fn meeting_struct_serialization_round_trip() {
        let meeting = Meeting {
            id: 1,
            title: "Test Meeting".to_string(),
            start_time: 1700000000,
            end_time: Some(1700001000),
            duration_ms: Some(60000),
            mic_file_name: Some("mic.wav".to_string()),
            system_file_name: None,
            summary: Some("A good meeting".to_string()),
            status: MeetingStatus::Complete,
        };

        let json = serde_json::to_string(&meeting).unwrap();
        let deserialized: Meeting = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.id, 1);
        assert_eq!(deserialized.title, "Test Meeting");
        assert_eq!(deserialized.status, MeetingStatus::Complete);
        assert_eq!(deserialized.summary, Some("A good meeting".to_string()));
    }

    #[test]
    fn meeting_segment_serialization_round_trip() {
        let seg = MeetingSegment {
            id: 1,
            meeting_id: 1,
            speaker_label: "Alice".to_string(),
            start_ms: 0,
            end_ms: 5000,
            text: "Hello world".to_string(),
            confidence: Some(0.95),
            audio_source: "mic".to_string(),
        };

        let json = serde_json::to_string(&seg).unwrap();
        let deserialized: MeetingSegment = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.speaker_label, "Alice");
        assert_eq!(deserialized.text, "Hello world");
        assert_eq!(deserialized.confidence, Some(0.95));
    }
}
