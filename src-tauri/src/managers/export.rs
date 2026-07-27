use crate::managers::meeting::{
    format_ms_to_hms, format_ms_to_srt_time, format_ms_to_vtt_time, ExportFormat, Meeting,
    MeetingSegment,
};

pub fn export(meeting: &Meeting, segments: &[MeetingSegment], format: &ExportFormat) -> String {
    match format {
        ExportFormat::Srt => export_srt(segments),
        ExportFormat::Vtt => export_vtt(segments),
        ExportFormat::Txt => export_txt(segments),
        ExportFormat::Markdown => export_markdown(meeting, segments),
    }
}

fn export_srt(segments: &[MeetingSegment]) -> String {
    let mut out = String::new();
    for (i, seg) in segments.iter().enumerate() {
        out.push_str(&format!(
            "{}\n{} --> {}\n{}: {}\n\n",
            i + 1,
            format_ms_to_srt_time(seg.start_ms),
            format_ms_to_srt_time(seg.end_ms),
            seg.speaker_label,
            seg.text,
        ));
    }
    out
}

fn export_vtt(segments: &[MeetingSegment]) -> String {
    let mut out = String::from("WEBVTT\n\n");
    for seg in segments {
        out.push_str(&format!(
            "{} --> {}\n<v {}>{}\n\n",
            format_ms_to_vtt_time(seg.start_ms),
            format_ms_to_vtt_time(seg.end_ms),
            seg.speaker_label,
            seg.text,
        ));
    }
    out
}

fn export_txt(segments: &[MeetingSegment]) -> String {
    let mut out = String::new();
    for seg in segments {
        out.push_str(&format!(
            "[{}] {}: {}\n",
            format_ms_to_hms(seg.start_ms),
            seg.speaker_label,
            seg.text,
        ));
    }
    out
}

fn export_markdown(meeting: &Meeting, segments: &[MeetingSegment]) -> String {
    let mut out = format!("# {}\n\n", meeting.title);

    if let Some(ref summary) = meeting.summary {
        out.push_str("## Summary\n\n");
        out.push_str(summary);
        out.push_str("\n\n");
    }

    out.push_str("## Transcript\n\n");
    for seg in segments {
        out.push_str(&format!(
            "**[{}] {}:**\n{}\n\n",
            format_ms_to_hms(seg.start_ms),
            seg.speaker_label,
            seg.text,
        ));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::managers::meeting::MeetingStatus;

    fn sample_meeting() -> Meeting {
        Meeting {
            id: 1,
            title: "Weekly Standup".to_string(),
            start_time: 1700000000,
            end_time: Some(1700001800),
            duration_ms: Some(1_800_000),
            mic_file_name: None,
            system_file_name: None,
            summary: None,
            status: MeetingStatus::Complete,
        }
    }

    fn sample_segments() -> Vec<MeetingSegment> {
        vec![
            MeetingSegment {
                id: 1,
                meeting_id: 1,
                speaker_label: "Alice".to_string(),
                start_ms: 0,
                end_ms: 5_000,
                text: "Good morning everyone.".to_string(),
                confidence: Some(0.95),
                audio_source: "mic".to_string(),
            },
            MeetingSegment {
                id: 2,
                meeting_id: 1,
                speaker_label: "Bob".to_string(),
                start_ms: 5_000,
                end_ms: 12_500,
                text: "Morning! Let's get started.".to_string(),
                confidence: None,
                audio_source: "system".to_string(),
            },
        ]
    }

    #[test]
    fn srt_has_sequence_numbers() {
        let output = export_srt(&sample_segments());
        assert!(output.starts_with("1\n"));
        assert!(output.contains("\n2\n"));
    }

    #[test]
    fn srt_uses_comma_millis_separator() {
        let output = export_srt(&sample_segments());
        assert!(output.contains(",000"), "SRT must use comma for millis");
    }

    #[test]
    fn srt_contains_arrow_separator() {
        let output = export_srt(&sample_segments());
        assert!(
            output.contains(" --> "),
            "SRT cues need --> between timestamps"
        );
    }

    #[test]
    fn srt_includes_speaker_and_text() {
        let output = export_srt(&sample_segments());
        assert!(output.contains("Alice: Good morning everyone."));
        assert!(output.contains("Bob: Morning! Let's get started."));
    }

    #[test]
    fn srt_empty_segments_produces_empty_string() {
        let output = export_srt(&[]);
        assert!(output.is_empty());
    }

    #[test]
    fn vtt_starts_with_header() {
        let output = export_vtt(&sample_segments());
        assert!(
            output.starts_with("WEBVTT\n\n"),
            "VTT must start with WEBVTT header"
        );
    }

    #[test]
    fn vtt_uses_dot_millis_separator() {
        let output = export_vtt(&sample_segments());
        let after_header = &output["WEBVTT\n\n".len()..];
        assert!(after_header.contains(".000"), "VTT must use dot for millis");
    }

    #[test]
    fn vtt_uses_voice_tags() {
        let output = export_vtt(&sample_segments());
        assert!(
            output.contains("<v Alice>"),
            "VTT must use <v Speaker> tags"
        );
        assert!(output.contains("<v Bob>"));
    }

    #[test]
    fn vtt_empty_segments_still_has_header() {
        let output = export_vtt(&[]);
        assert_eq!(output, "WEBVTT\n\n");
    }

    #[test]
    fn txt_has_timestamp_speaker_text_format() {
        let output = export_txt(&sample_segments());
        assert!(output.contains("[00:00:00] Alice: Good morning everyone.\n"));
        assert!(output.contains("[00:00:05] Bob: Morning! Let's get started.\n"));
    }

    #[test]
    fn txt_empty_segments_produces_empty() {
        let output = export_txt(&[]);
        assert!(output.is_empty());
    }

    #[test]
    fn markdown_starts_with_title_heading() {
        let output = export_markdown(&sample_meeting(), &sample_segments());
        assert!(output.starts_with("# Weekly Standup\n\n"));
    }

    #[test]
    fn markdown_has_transcript_heading() {
        let output = export_markdown(&sample_meeting(), &sample_segments());
        assert!(output.contains("## Transcript\n\n"));
    }

    #[test]
    fn markdown_includes_speaker_labels_bold() {
        let output = export_markdown(&sample_meeting(), &sample_segments());
        assert!(output.contains("**[00:00:00] Alice:**"));
        assert!(output.contains("**[00:00:05] Bob:**"));
    }

    #[test]
    fn markdown_no_summary_section_when_none() {
        let output = export_markdown(&sample_meeting(), &sample_segments());
        assert!(!output.contains("## Summary"));
    }

    #[test]
    fn markdown_includes_summary_when_present() {
        let mut meeting = sample_meeting();
        meeting.summary = Some("Key decisions were made.".to_string());
        let output = export_markdown(&meeting, &sample_segments());
        assert!(output.contains("## Summary\n\n"));
        assert!(output.contains("Key decisions were made."));
    }

    #[test]
    fn markdown_empty_segments_still_has_structure() {
        let output = export_markdown(&sample_meeting(), &[]);
        assert!(output.contains("# Weekly Standup"));
        assert!(output.contains("## Transcript"));
    }

    #[test]
    fn export_dispatches_to_correct_format() {
        let meeting = sample_meeting();
        let segments = sample_segments();

        let srt = export(&meeting, &segments, &ExportFormat::Srt);
        assert!(
            srt.starts_with("1\n"),
            "SRT should start with sequence number"
        );

        let vtt = export(&meeting, &segments, &ExportFormat::Vtt);
        assert!(vtt.starts_with("WEBVTT"), "VTT should start with header");

        let txt = export(&meeting, &segments, &ExportFormat::Txt);
        assert!(
            txt.starts_with("[00:00:00]"),
            "TXT should start with timestamp"
        );

        let md = export(&meeting, &segments, &ExportFormat::Markdown);
        assert!(
            md.starts_with("# Weekly"),
            "Markdown should start with title heading"
        );
    }
}
