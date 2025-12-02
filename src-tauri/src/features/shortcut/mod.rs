//! Shortcut feature module.
//!
//! This module handles all keyboard shortcut functionality including:
//! - Shortcut initialization and registration (`init`)
//! - Escape key handling for canceling operations (`escape`)
//! - Binding management commands (`bindings`)
//! - Settings commands organized by feature area (`settings`)

pub mod bindings;
pub mod escape;
pub mod init;
pub mod settings;

// Re-export the main initialization function
pub use init::init_shortcuts;
