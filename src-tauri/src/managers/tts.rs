//! TTS Manager - System Text-to-Speech
//!
//! Manages system native TTS with automatic language detection

use anyhow::{Context, Result};
use log::{debug, info, warn};
use std::sync::Mutex;
use tts::{Features, Tts, Voice};
use whichlang::detect_language;

/// Manager for system TTS with automatic language detection
pub struct TtsManager {
    system_tts: Mutex<Option<Tts>>,
    #[allow(dead_code)]
    features: Mutex<Option<Features>>,
}

impl TtsManager {
    /// Create a new TTS manager
    pub fn new() -> Self {
        Self {
            system_tts: Mutex::new(None),
            features: Mutex::new(None),
        }
    }

    /// Initialize the system TTS engine
    pub fn initialize(&self) -> Result<()> {
        info!("Initializing native TTS engine...");

        let tts = Tts::default().context("Failed to initialize TTS engine")?;
        let features = tts.supported_features();

        info!(
            "TTS initialized with features: rate={}, pitch={}, volume={}",
            features.rate, features.pitch, features.volume
        );

        *self.system_tts.lock().unwrap() = Some(tts);
        *self.features.lock().unwrap() = Some(features);

        info!("Native TTS engine initialized successfully");
        Ok(())
    }

    /// Check if the system engine is ready
    pub fn is_ready(&self) -> bool {
        self.system_tts.lock().unwrap().is_some()
    }

    /// Detect the language of the given text
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
            &text[..text.len().min(50)]
        );
        Some(lang_code.to_string())
    }

    /// Find the best voice for the given language (system TTS)
    fn find_voice_for_language(&self, language: &str) -> Option<Voice> {
        if !self.is_ready() {
            if let Err(e) = self.initialize() {
                warn!("Failed to initialize TTS: {}", e);
                return None;
            }
        }

        let guard = self.system_tts.lock().unwrap();
        let tts = guard.as_ref()?;
        let voices = tts.voices().ok()?;

        // Find a voice that matches the language prefix
        voices.into_iter().find(|v| {
            let voice_lang = v.language().to_string().to_lowercase();
            let target_lang = language.to_lowercase();
            voice_lang.starts_with(&target_lang)
                || voice_lang.split('-').next() == Some(&target_lang)
        })
    }

    /// Speak text using system TTS with automatic language detection and voice selection
    pub fn speak(&self, text: &str) -> Result<()> {
        if !self.is_ready() {
            self.initialize()?;
        }

        // Detect language and find appropriate voice
        if let Some(detected_lang) = self.detect_language(text) {
            if let Some(voice) = self.find_voice_for_language(&detected_lang) {
                let mut guard = self.system_tts.lock().unwrap();
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

        // Fallback to default voice
        debug!("Falling back to default voice");
        let mut guard = self.system_tts.lock().unwrap();
        let tts = guard.as_mut().context("TTS not initialized")?;
        tts.speak(text, false).context("Failed to speak text")?;
        Ok(())
    }
}
