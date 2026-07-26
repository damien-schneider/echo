use crate::managers::streaming::PipelineEvent;

/// Invariants: push never emits `Some("")`; finals never retracted; identical emits dedup'd.
#[derive(Debug, Default)]
pub struct DictationAccumulator {
    committed_finals: Vec<String>,
    interim_committed: String,
    interim_tentative: String,
    last_emitted: Option<String>,
}

#[cfg(test)]
include!("dictation_accumulator_tests.rs");

impl DictationAccumulator {
    pub fn new() -> Self {
        Self::default()
    }

    /// None on no-change or empty display.
    pub fn push(&mut self, event: PipelineEvent) -> Option<String> {
        match event {
            PipelineEvent::Interim {
                committed_text,
                tentative_text,
                ..
            } => {
                self.interim_committed = committed_text;
                self.interim_tentative = tentative_text;
            }
            PipelineEvent::Final { text, .. } => {
                if !text.trim().is_empty() {
                    self.committed_finals.push(text);
                }
                self.interim_committed.clear();
                self.interim_tentative.clear();
            }
        }
        self.maybe_emit()
    }

    #[allow(dead_code)]
    pub fn reset(&mut self) {
        self.committed_finals.clear();
        self.interim_committed.clear();
        self.interim_tentative.clear();
        self.last_emitted = None;
    }

    #[allow(dead_code)]
    pub fn final_segment_count(&self) -> usize {
        self.committed_finals.len()
    }

    fn build_display(&self) -> String {
        let mut parts: Vec<&str> = Vec::with_capacity(self.committed_finals.len() + 2);
        for f in &self.committed_finals {
            if !f.is_empty() {
                parts.push(f);
            }
        }
        if !self.interim_committed.is_empty() {
            parts.push(&self.interim_committed);
        }
        if !self.interim_tentative.is_empty() {
            parts.push(&self.interim_tentative);
        }
        parts.join(" ")
    }

    pub fn transcript(&self) -> String {
        self.build_display()
    }

    fn maybe_emit(&mut self) -> Option<String> {
        let display = self.build_display();
        if display.is_empty() {
            return None;
        }
        if self.last_emitted.as_deref() == Some(display.as_str()) {
            return None;
        }
        self.last_emitted = Some(display.clone());
        Some(display)
    }
}
