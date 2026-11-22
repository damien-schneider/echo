use serde::Deserialize;

pub(super) const ZED_COPY_METADATA: &str = "zed-metadata";

#[derive(Deserialize)]
struct ZedCopiedRange {
    is_entire_line: bool,
}

/// Zed copies the caret's whole line when nothing is selected and marks every range `is_entire_line` (vim line mode too).
pub(super) fn copied_line_without_selection(metadata: &[u8]) -> bool {
    serde_json::from_slice::<Vec<ZedCopiedRange>>(metadata)
        .is_ok_and(|ranges| !ranges.is_empty() && ranges.iter().all(|range| range.is_entire_line))
}
