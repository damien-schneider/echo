# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Prerequisites:**

- [Rust](https://rustup.rs/) (latest stable)
- [Bun](https://bun.sh/) package manager

**Core Development:**

```bash
# Install dependencies
bun install

# Run in development mode
bun run tauri dev
# If cmake error on macOS:
CMAKE_POLICY_VERSION_MINIMUM=3.5 bun run tauri dev

# Build for production
bun run tauri build

# Frontend only development
bun run dev         # Start Vite dev server
bun run pipeline    # Turbo build (type-check + Vite)
bun run preview     # Preview built frontend
```

**Model Setup (Required for Development):**

```bash
# Create models directory
mkdir -p src-tauri/resources/models

# Download required VAD model
curl -o src-tauri/resources/models/silero_vad_v4.onnx https://blob.handy.computer/silero_vad_v4.onnx
```

## Architecture Overview

Echo is a cross-platform desktop speech-to-text application built with Tauri (Rust backend + React/TypeScript frontend).

### Core Components

**Backend (Rust - src-tauri/src/):**

- `lib.rs` - Main application entry point with Tauri setup, tray menu, and managers
- `managers/` - Core business logic managers:
  - `audio.rs` - Audio recording and device management
  - `database.rs` - SQLite database initialization and migrations
  - `history.rs` - Transcription history storage (database + audio files)
  - `model.rs` - Whisper model downloading and management
  - `transcription.rs` - Speech-to-text processing pipeline
- `audio_toolkit/` - Low-level audio processing:
  - `audio/` - Device enumeration, recording, resampling
  - `vad/` - Voice Activity Detection using Silero VAD
- `commands/` - Tauri command handlers for frontend communication
- `shortcut.rs` - Global keyboard shortcut handling
- `settings.rs` - Application settings management

**Frontend (React/TypeScript - src/):**

- `App.tsx` - Main application component with onboarding flow
- `components/settings/` - Settings UI components
- `components/model-selector/` - Model management interface
- `hooks/` - React hooks for settings and model management
- `lib/types.ts` - Shared TypeScript type definitions

### Key Architecture Patterns

**Manager Pattern:** Core functionality is organized into managers (Audio, Model, Transcription) that are initialized at startup and managed by Tauri's state system.

**Command-Event Architecture:** Frontend communicates with backend via Tauri commands, backend sends updates via events.

**Pipeline Processing:** Audio → VAD → Whisper → Text output with configurable components at each stage.

### Technology Stack

**Core Libraries:**

- `whisper-rs` - Local Whisper inference with GPU acceleration
- `cpal` - Cross-platform audio I/O
- `vad-rs` - Voice Activity Detection
- `rdev` - Global keyboard shortcuts
- `rubato` - Audio resampling
- `rodio` - Audio playback for feedback sounds

**Platform-Specific Features:**

- macOS: Metal acceleration for Whisper, accessibility permissions
- Windows: Vulkan acceleration, code signing
- Linux: OpenBLAS + Vulkan acceleration

### Application Flow

1. **Initialization:** App starts minimized to tray, loads settings, initializes managers
2. **Model Setup:** First-run downloads preferred Whisper model (Small/Medium/Turbo/Large)
3. **Recording:** Global shortcut triggers audio recording with VAD filtering
4. **Processing:** Audio sent to Whisper model for transcription
5. **Output:** Text pasted to active application via system clipboard

### Settings System

Settings are stored using Tauri's store plugin with reactive updates:

- Keyboard shortcuts (configurable, supports push-to-talk)
- Audio devices (microphone/output selection)
- Model preferences (Small/Medium/Turbo/Large Whisper variants)
- Audio feedback and translation options

### Single Instance Architecture

The app enforces single instance behavior - launching when already running brings the settings window to front rather than creating a new process.

## Coding Conventions

### Import Paths

Always use absolute import paths with the `@/` alias instead of relative paths in TypeScript/React files:

- ✅ `import { Button } from "@/components/ui/Button"`
- ❌ `import { Button } from "../ui/Button"`

## Rust Best Practices

### Error Handling

- Use `anyhow::Result` for application-level errors with context
- Add context to errors using `.context()` or `.with_context()` for actionable messages
- Fail fast on initialization errors; don't silently recover from unexpected states
- Use `?` operator for error propagation, avoiding manual `.unwrap()` in production code

### Database Architecture

- Backend-only databases use `rusqlite` directly with self-managed migrations
- Schema must be initialized at application startup, not lazily
- Migrations are versioned and tracked in a `schema_version` table
- Operations assume valid schema after initialization (fail-fast on schema errors)
- `tauri-plugin-sql` is for frontend-to-database communication only; don't mix with backend rusqlite
- Use transactions for atomic multi-step database operations

### Code Organization

- Managers encapsulate domain logic and own their resources (connections, state)
- Keep modules focused: separate concerns like migrations from business logic
- Use `pub(crate)` for internal APIs, `pub` only for external interfaces
- Document public APIs with `///` doc comments explaining purpose and usage

### Safety & Robustness

- Prefer `Arc<T>` for shared ownership across async boundaries
- Use `Mutex` or `RwLock` for interior mutability, keeping critical sections short
- Validate inputs at boundaries (commands, file I/O) rather than deep in logic
- Use strong types over primitives where semantic meaning matters
