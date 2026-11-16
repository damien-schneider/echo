use anyhow::{Context, Result};
use log::{debug, info, warn};
use std::sync::{Mutex, MutexGuard, PoisonError};
use tts::{Tts, Voice};
use whichlang::detect_language;

#[derive(Default)]
pub struct TtsManager {
    system_tts: Mutex<Option<Tts>>,
}

impl TtsManager {
    pub fn new() -> Self {
        Self::default()
    }

    fn system_tts(&self) -> MutexGuard<'_, Option<Tts>> {
        self.system_tts
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
    }

    pub fn initialize(&self) -> Result<()> {
        info!("Initializing native TTS engine...");

        let tts = Tts::default().context("Failed to initialize TTS engine")?;
        let features = tts.supported_features();

        info!(
            "TTS initialized with features: rate={}, pitch={}, volume={}",
            features.rate, features.pitch, features.volume
        );

        *self.system_tts() = Some(tts);

        info!("Native TTS engine initialized successfully");
        Ok(())
    }

    pub fn is_ready(&self) -> bool {
        self.system_tts().is_some()
    }

    fn detect_language(&self, text: &str) -> Option<String> {
        let detected = detect_language(text);
        let lang_code = match detected {
            whichlang::Lang::Ara => "ar",
            whichlang::Lang::Cmn => "zh",
            whichlang::Lang::Deu => "de",
            whichlang::Lang::Eng => "en",
            whichlang::Lang::Fra => "fr",
            whichlang::Lang::Hin => "hi",
            whichlang::Lang::Ita => "it",
            whichlang::Lang::Jpn => "ja",
            whichlang::Lang::Kor => "ko",
            whichlang::Lang::Nld => "nl",
            whichlang::Lang::Por => "pt",
            whichlang::Lang::Rus => "ru",
            whichlang::Lang::Spa => "es",
            whichlang::Lang::Swe => "sv",
            whichlang::Lang::Tur => "tr",
            whichlang::Lang::Vie => "vi",
        };
        info!(
            "Detected language: {} for text: {}...",
            lang_code,
            log_preview(text)
        );
        Some(lang_code.to_string())
    }

    fn find_voice_for_language(&self, language: &str) -> Option<Voice> {
        if !self.is_ready() {
            if let Err(e) = self.initialize() {
                warn!("Failed to initialize TTS: {}", e);
                return None;
            }
        }

        let guard = self.system_tts();
        let tts = guard.as_ref()?;
        let voices = tts.voices().ok()?;

        voices.into_iter().find(|v| {
            let voice_lang = v.language().to_string().to_lowercase();
            let target_lang = language.to_lowercase();
            voice_lang.starts_with(&target_lang)
                || voice_lang.split('-').next() == Some(&target_lang)
        })
    }

    pub fn speak(&self, text: &str) -> Result<()> {
        if !self.is_ready() {
            self.initialize()?;
        }

        if let Some(detected_lang) = self.detect_language(text) {
            if let Some(voice) = self.find_voice_for_language(&detected_lang) {
                let mut guard = self.system_tts();
                let tts = guard.as_mut().context("TTS not initialized")?;

                info!(
                    "Auto-selected voice '{}' for language '{}'",
                    voice.name(),
                    detected_lang
                );
                if let Err(e) = tts.set_voice(&voice) {
                    warn!("Failed to set auto-detected voice: {}, using default", e);
                }

                debug!("Speaking with auto-detected voice: {}", text);
                tts.speak(text, false).context("Failed to speak text")?;
                return Ok(());
            }
        }

        debug!("Falling back to default voice");
        let mut guard = self.system_tts();
        let tts = guard.as_mut().context("TTS not initialized")?;
        tts.speak(text, false).context("Failed to speak text")?;
        Ok(())
    }
}

/// Cut on a character: byte 50 can fall inside one, and slicing there panics.
fn log_preview(text: &str) -> &str {
    let end = text
        .char_indices()
        .nth(50)
        .map_or(text.len(), |(index, _)| index);
    &text[..end]
}

#[cfg(test)]
mod tests {
    use super::log_preview;

    #[test]
    fn a_reply_in_a_multibyte_script_is_previewed_without_splitting_a_character() {
        let reply = "日".repeat(40);

        assert_eq!(log_preview(&reply), reply);
    }

    #[test]
    fn a_long_reply_is_previewed_by_its_first_fifty_characters() {
        let reply = "é".repeat(80);

        assert_eq!(log_preview(&reply), "é".repeat(50));
    }
}
