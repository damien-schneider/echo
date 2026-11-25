use crate::features::polish::manager::PolishManager;
use crate::settings::{get_settings, AppSettings};
use anyhow::{Context, Result};
use log::warn;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tokio::time::{timeout_at, Instant};

mod command;
mod tools;

pub(crate) use tools::{speak_reply, ToolResult};

/// Past this the words are delivered as spoken: a paste that waits longer feels lost.
pub(crate) const MODEL_PASS_BUDGET: Duration = Duration::from_secs(27);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ModelPass {
    Rewrite,
    Command,
}

pub(crate) struct Spoken<'a> {
    pub(crate) transcript: &'a str,
    pub(crate) generation: u64,
}

#[derive(Debug)]
pub(crate) enum ModelPassOutcome {
    Unchanged,
    Rewritten { text: String, prompt_name: String },
    Commanded(ToolResult),
}

impl ModelPassOutcome {
    /// What history keeps beside the spoken words: the rewrite and the prompt that made it.
    pub(crate) fn rewrite(&self) -> Option<(String, String)> {
        match self {
            ModelPassOutcome::Rewritten { text, prompt_name } => {
                Some((text.clone(), prompt_name.clone()))
            }
            ModelPassOutcome::Unchanged | ModelPassOutcome::Commanded(_) => None,
        }
    }
}

/// Whatever the model does, the dictation still ends with the words as they were spoken.
pub(crate) async fn run(app: &AppHandle, pass: ModelPass, spoken: Spoken<'_>) -> ModelPassOutcome {
    let Some(polish) = app.try_state::<Arc<PolishManager>>() else {
        return ModelPassOutcome::Unchanged;
    };
    let deadline = Instant::now() + MODEL_PASS_BUDGET;
    let outcome = match pass {
        ModelPass::Rewrite => rewritten(&polish, spoken.transcript, deadline).await,
        ModelPass::Command => commanded(app, &polish, &spoken, deadline).await,
    };
    outcome.unwrap_or_else(|error| {
        warn!("{pass:?} pass failed, the transcript stays as spoken: {error:#}");
        ModelPassOutcome::Unchanged
    })
}

async fn rewritten(
    polish: &PolishManager,
    transcript: &str,
    deadline: Instant,
) -> Result<ModelPassOutcome> {
    let rewrite = timeout_at(deadline, polish.rewrite_dictation(transcript))
        .await
        .context("Dictation rewrite timed out")??;
    let Some(rewrite) = rewrite else {
        return Ok(ModelPassOutcome::Unchanged);
    };
    let text = crate::actions::sanitize_dictation_output(&rewrite.text);
    if text.is_empty() {
        return Ok(ModelPassOutcome::Unchanged);
    }
    Ok(ModelPassOutcome::Rewritten {
        text,
        prompt_name: rewrite.prompt_name,
    })
}

async fn commanded(
    app: &AppHandle,
    polish: &PolishManager,
    spoken: &Spoken<'_>,
    deadline: Instant,
) -> Result<ModelPassOutcome> {
    let body = command::request_body(spoken.transcript);
    let Some(answer) = timeout_at(deadline, polish.complete_with_tools(&body))
        .await
        .context("Voice command timed out")??
    else {
        return rewritten(polish, spoken.transcript, deadline).await;
    };
    let mut results = Vec::new();
    for voice_command in command::commands_in(&answer)? {
        // cancel only stops this task at its next await: a tool must not start past it
        if crate::actions::OPERATION_GENERATION.load(Ordering::SeqCst) != spoken.generation {
            break;
        }
        results.push(tools::execute(app, voice_command).await);
    }
    Ok(reply_among(results).map_or(ModelPassOutcome::Unchanged, ModelPassOutcome::Commanded))
}

/// One island line for several commands: a failure must not hide behind a later success.
fn reply_among(mut results: Vec<ToolResult>) -> Option<ToolResult> {
    match results.iter().position(|result| !result.success) {
        Some(failed) => Some(results.swap_remove(failed)),
        None => results.pop(),
    }
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
    fn for_model(settings: &AppSettings, supports_voice_commands: bool) -> Self {
        Self {
            rewrite: settings.dictation_rewrite_prompt().is_some(),
            voice_commands: settings.voice_commands && supports_voice_commands,
        }
    }

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
    let Some(polish) = app
        .try_state::<Arc<PolishManager>>()
        .filter(|polish| polish.is_downloaded())
    else {
        return EnabledPasses::default();
    };
    EnabledPasses::for_model(&get_settings(app), polish.supports_voice_commands())
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
    use super::{
        model_pass_for, reply_among, DictationTarget, EnabledPasses, ModelPass, ToolResult,
    };
    use crate::settings::{get_default_settings, AppSettings, PolishLevel, PromptRef};

    fn reply(display_message: &str, success: bool) -> ToolResult {
        ToolResult {
            display_message: display_message.to_string(),
            success,
        }
    }

    #[test]
    fn a_command_that_failed_is_reported_even_when_a_later_one_worked() {
        let results = vec![
            reply("Couldn't find an app named Slak", false),
            reply("Opened Firefox", true),
        ];

        let reported = reply_among(results).map(|reply| reply.display_message);

        assert_eq!(reported.as_deref(), Some("Couldn't find an app named Slak"));
    }

    #[test]
    fn commands_that_all_worked_report_the_last_one() {
        let results = vec![reply("Opened Slack", true), reply("Opened Firefox", true)];

        let reported = reply_among(results).map(|reply| reply.display_message);

        assert_eq!(reported.as_deref(), Some("Opened Firefox"));
    }

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
    fn an_alternative_model_rewrites_no_field_dictation_with_voice_commands_enabled() {
        let settings = AppSettings {
            dictation_prompt: Some(PromptRef::Builtin(PolishLevel::default())),
            voice_commands: true,
            ..get_default_settings()
        };

        let target = DictationTarget::NoTextField;
        assert_eq!(
            model_pass_for(target, EnabledPasses::for_model(&settings, false)),
            Some(ModelPass::Rewrite)
        );
        assert_eq!(
            model_pass_for(target, EnabledPasses::for_model(&settings, true)),
            Some(ModelPass::Command)
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
