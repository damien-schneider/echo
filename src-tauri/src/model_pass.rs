use crate::features::polish::manager::PolishManager;
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelPass {
    Rewrite,
    Command,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DictationTarget {
    /// The chat model reads the text next, so no pass runs before it.
    Chat,
    /// A focus that takes text, or might.
    TextField,
    NoTextField,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct EnabledPasses {
    pub rewrite: bool,
    pub voice_commands: bool,
}

impl EnabledPasses {
    fn any(self) -> bool {
        self.rewrite || self.voice_commands
    }
}

pub fn model_pass_for(target: DictationTarget, enabled: EnabledPasses) -> Option<ModelPass> {
    match target {
        DictationTarget::Chat => None,
        DictationTarget::NoTextField if enabled.voice_commands => Some(ModelPass::Command),
        DictationTarget::TextField | DictationTarget::NoTextField if enabled.rewrite => {
            Some(ModelPass::Rewrite)
        }
        DictationTarget::TextField | DictationTarget::NoTextField => None,
    }
}

fn enabled_passes(app: &AppHandle) -> EnabledPasses {
    let model_is_downloaded = app
        .try_state::<Arc<PolishManager>>()
        .is_some_and(|polish| polish.is_downloaded());
    if !model_is_downloaded {
        return EnabledPasses::default();
    }
    let settings = crate::settings::get_settings(app);
    EnabledPasses {
        rewrite: settings.post_process_enabled,
        voice_commands: settings.voice_commands,
    }
}

pub(crate) fn routed_model_pass(app: &AppHandle) -> Option<ModelPass> {
    let enabled = enabled_passes(app);
    if !enabled.any() {
        return None;
    }
    model_pass_for(crate::dictation::target(app), enabled)
}

#[cfg(test)]
mod tests {
    use super::{model_pass_for, DictationTarget, EnabledPasses, ModelPass};

    const BOTH: EnabledPasses = EnabledPasses {
        rewrite: true,
        voice_commands: true,
    };

    #[test]
    fn chat_dictation_never_waits_on_a_model_pass() {
        assert_eq!(model_pass_for(DictationTarget::Chat, BOTH), None);
    }

    #[test]
    fn text_field_dictation_is_rewritten_never_run_as_a_command() {
        assert_eq!(
            model_pass_for(DictationTarget::TextField, BOTH),
            Some(ModelPass::Rewrite)
        );
        let commands_only = EnabledPasses {
            rewrite: false,
            voice_commands: true,
        };
        assert_eq!(
            model_pass_for(DictationTarget::TextField, commands_only),
            None
        );
    }

    #[test]
    fn speech_with_no_text_field_runs_as_a_command() {
        assert_eq!(
            model_pass_for(DictationTarget::NoTextField, BOTH),
            Some(ModelPass::Command)
        );
    }

    #[test]
    fn with_commands_off_speech_with_no_text_field_is_still_rewritten() {
        let rewrite_only = EnabledPasses {
            rewrite: true,
            voice_commands: false,
        };
        assert_eq!(
            model_pass_for(DictationTarget::NoTextField, rewrite_only),
            Some(ModelPass::Rewrite)
        );
    }

    #[test]
    fn with_both_passes_off_every_dictation_pastes_directly() {
        for target in [
            DictationTarget::Chat,
            DictationTarget::TextField,
            DictationTarget::NoTextField,
        ] {
            assert_eq!(model_pass_for(target, EnabledPasses::default()), None);
        }
    }
}
