#!/usr/bin/env bash
# Convert each ggml-*.bin Whisper model in <models-dir> into a sibling
# .mlmodelc/ directory so whisper.cpp can offload the encoder onto the Apple
# Neural Engine. whisper.cpp's CoreML support auto-loads the matching
# *-encoder.mlmodelc placed next to the .bin; presence is opt-in per-model.
#
# Usage:
#   scripts/convert-whisper-coreml.sh [models-dir]
#
# If models-dir is omitted, defaults to the macOS app-data path used by Echo's
# ModelManager (Tauri AppDataDir under ~/Library/Application Support).
#
# Requirements (macOS, Apple Silicon recommended):
#   - Xcode Command Line Tools  (xcrun coremlcompiler)
#   - Python 3.10+ with: coremltools, torch, ane_transformers, openai-whisper
#
# Quick setup hint (only if you don't already have the deps):
#   python3 -m venv /tmp/whisper-coreml-venv
#   source /tmp/whisper-coreml-venv/bin/activate
#   pip install --upgrade pip
#   pip install ane_transformers openai-whisper coremltools torch
#
# This script clones whisper.cpp into /tmp/whisper-cpp-coreml on first run and
# delegates to its `models/generate-coreml-model.sh`.

set -euo pipefail

MODELS_DIR="${1:-}"
if [[ -z "${MODELS_DIR}" ]]; then
  MODELS_DIR="${HOME}/Library/Application Support/com.echo.app/models"
fi

if [[ ! -d "${MODELS_DIR}" ]]; then
  echo "error: models dir does not exist: ${MODELS_DIR}" >&2
  echo "hint:  pass the directory containing your ggml-*.bin files as arg 1" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "error: python3 is required (install via Xcode CLT or homebrew)" >&2
  exit 1
fi

if ! command -v xcrun >/dev/null 2>&1; then
  echo "error: xcrun is required — run 'xcode-select --install' first" >&2
  exit 1
fi

if ! python3 -c "import coremltools, torch" >/dev/null 2>&1; then
  cat >&2 <<'EOF'
error: Python deps missing. Run the following ONCE to set up a venv:

  python3 -m venv /tmp/whisper-coreml-venv
  source /tmp/whisper-coreml-venv/bin/activate
  pip install --upgrade pip
  pip install ane_transformers openai-whisper coremltools torch

Then re-run this script from the same shell so 'python3' resolves to the venv.
EOF
  exit 1
fi

WHISPER_CPP_DIR="${WHISPER_CPP_DIR:-/tmp/whisper-cpp-coreml}"
if [[ ! -d "${WHISPER_CPP_DIR}" ]]; then
  echo "==> Cloning whisper.cpp into ${WHISPER_CPP_DIR}"
  git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git "${WHISPER_CPP_DIR}"
fi

CONVERTER="${WHISPER_CPP_DIR}/models/generate-coreml-model.sh"
if [[ ! -x "${CONVERTER}" ]]; then
  echo "error: converter not found or not executable: ${CONVERTER}" >&2
  exit 1
fi

# Map an Echo .bin filename to the model identifier
# generate-coreml-model.sh expects (e.g. "large-v3-turbo").
derive_id() {
  local fname="$1"
  case "${fname}" in
    ggml-tiny.bin)              echo "tiny" ;;
    ggml-base.bin)              echo "base" ;;
    ggml-small.bin)             echo "small" ;;
    ggml-medium.bin)            echo "medium" ;;
    whisper-medium-q4_1.bin)    echo "medium" ;;  # quantised, encoder graph identical
    ggml-large-v3.bin)          echo "large-v3" ;;
    ggml-large-v3-q5_0.bin)     echo "large-v3" ;;
    ggml-large-v3-turbo.bin)    echo "large-v3-turbo" ;;
    *)                          echo "" ;;
  esac
}

shopt -s nullglob
found_any=0
for bin in "${MODELS_DIR}"/ggml-*.bin "${MODELS_DIR}"/whisper-*.bin; do
  found_any=1
  fname="$(basename "${bin}")"
  id="$(derive_id "${fname}")"
  if [[ -z "${id}" ]]; then
    echo "skip: ${fname} (no known CoreML mapping)"
    continue
  fi

  out_dir="${MODELS_DIR}/${fname%.bin}-encoder.mlmodelc"
  if [[ -d "${out_dir}" ]]; then
    echo "skip: ${fname} (mlmodelc already present at ${out_dir})"
    continue
  fi

  echo "==> Converting ${fname} (whisper id: ${id})"
  pushd "${WHISPER_CPP_DIR}" >/dev/null
  "${CONVERTER}" "${id}"
  popd >/dev/null

  generated="${WHISPER_CPP_DIR}/models/ggml-${id}-encoder.mlmodelc"
  if [[ ! -d "${generated}" ]]; then
    echo "error: expected ${generated} after conversion of ${id}" >&2
    exit 1
  fi

  # Whisper.cpp matches by .bin stem, so name the output accordingly.
  echo "    -> ${out_dir}"
  cp -R "${generated}" "${out_dir}"
done

if [[ "${found_any}" -eq 0 ]]; then
  echo "warning: no ggml-*.bin or whisper-*.bin files found in ${MODELS_DIR}"
fi

echo "Done. Restart Echo and check logs for: 'CoreML encoder found at ...'"
