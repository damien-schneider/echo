# Build Instructions

This guide covers how to set up the development environment and build Echo from source across different platforms.

## Prerequisites

### All Platforms
- [Rust](https://rustup.rs/) (latest stable)
- [Bun](https://bun.sh/) package manager
- [Tauri Prerequisites](https://tauri.app/start/prerequisites/)

### Platform-Specific Requirements

#### macOS
- Xcode Command Line Tools
- Install with: `xcode-select --install`

#### Windows  
- Microsoft C++ Build Tools
- Visual Studio 2019/2022 with C++ development tools
- Or Visual Studio Build Tools 2019/2022

#### Linux
- Build essentials
- ALSA development libraries
- Install with:
  ```bash
  # Ubuntu/Debian
  sudo apt update
  sudo apt install build-essential libasound2-dev pkg-config libssl-dev libvulkan-dev vulkan-tools glslc libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf libspeechd-dev libshaderc-dev

  # Fedora/RHEL
  sudo dnf groupinstall "Development Tools"
  sudo dnf install alsa-lib-devel pkgconf openssl-devel vulkan-devel \
    gtk3-devel webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel

  # Arch Linux
  sudo pacman -S base-devel alsa-lib pkgconf openssl vulkan-devel \
    gtk3 webkit2gtk-4.1 libappindicator-gtk3 librsvg
  ```

## Setup Instructions

### 1. Clone the Repository
```bash
git clone git@github.com:damien-schneider/Echo.git
cd Echo
```

### 2. Install Dependencies
```bash
bun install
```

### 3. Download Required Models
Echo requires a VAD (Voice Activity Detection) model to function

## Optional: CoreML acceleration for whisper.cpp on Apple Silicon

On macOS, Echo builds whisper.cpp with the `coreml` feature enabled by default.
At runtime, whisper.cpp will look for a sibling `*-encoder.mlmodelc/` directory
next to each `ggml-*.bin` model and, when present, offload the encoder onto the
Apple Neural Engine for roughly a 2-3x encoder-pass speedup. Without the
`.mlmodelc`, the model just falls back to the Metal+CPU path — no error.

The CoreML model files are NOT bundled (each adds 30-300 MB), so this is opt-in
per machine.

### One-time setup

1. Install Xcode Command Line Tools (required for `coremlcompiler`):
   ```bash
   xcode-select --install
   ```
2. Install the Python dependencies in a venv:
   ```bash
   python3 -m venv /tmp/whisper-coreml-venv
   source /tmp/whisper-coreml-venv/bin/activate
   pip install --upgrade pip
   pip install ane_transformers openai-whisper coremltools torch
   ```

### Convert your downloaded models

From the activated venv, run the conversion script. It defaults to Echo's
macOS models directory (`~/Library/Application Support/com.echo.app/models`):

```bash
scripts/convert-whisper-coreml.sh
# or, with an explicit directory:
scripts/convert-whisper-coreml.sh /path/to/models
```

For each `ggml-*.bin` it recognises, the script generates a sibling
`*-encoder.mlmodelc/` next to the `.bin`. Conversion of `large-v3-turbo` can
take 10-15 min on an M-series Mac.

### Verify CoreML is active

Restart Echo and check the logs after loading a Whisper model. You should see:

```
Whisper model <id>: CoreML encoder found at .../ggml-<id>-encoder.mlmodelc — Apple Neural Engine should activate
```

If you instead see a `no sibling *-encoder.mlmodelc` debug line, the model is
running on Metal+CPU only.

> Note: each model directory roughly doubles in size (the `.bin` plus a similar-sized
> `.mlmodelc/`). Delete the `.mlmodelc/` to revert to the Metal+CPU path.
