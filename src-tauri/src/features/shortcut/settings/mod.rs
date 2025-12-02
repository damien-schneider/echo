//! Settings-related commands for shortcut module.
//!
//! This module is organized by feature area:
//! - `audio` - Audio-related settings (feedback, theme, mute)
//! - `general` - General application settings (language, overlay, clipboard, etc.)
//! - `post_process` - LLM/post-processing settings (providers, prompts, models)
//! - `input_tracking` - Input tracking settings

pub mod audio;
pub mod general;
pub mod input_tracking;
pub mod post_process;
