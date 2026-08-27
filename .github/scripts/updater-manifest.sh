#!/usr/bin/env bash
# Builds the Tauri updater manifest from the artifacts already on a release.
# Every ".sig" asset names the bundle it signs, and the bundle's extension and
# architecture name the platform keys a client looks itself up under.
set -euo pipefail

: "${GITHUB_REPOSITORY:?}" "${RELEASE_ID:?}" "${VERSION:?}"
OUTPUT="${1:-latest.json}"

architecture_of() {
  case "$1" in
  *aarch64* | *arm64*) echo "aarch64" ;;
  *x64* | *amd64* | *x86_64*) echo "x86_64" ;;
  *) echo "" ;;
  esac
}

keys_for() {
  local bundle="$1" architecture
  architecture=$(architecture_of "$bundle")
  case "$bundle" in
  *.app.tar.gz) echo "darwin-$architecture darwin-$architecture-app" ;;
  *.AppImage) echo "linux-x86_64 linux-x86_64-appimage" ;;
  *.deb) echo "linux-x86_64-deb" ;;
  *.rpm) echo "linux-x86_64-rpm" ;;
  *.msi) echo "windows-$architecture windows-$architecture-msi" ;;
  *-setup.exe) echo "windows-$architecture-nsis" ;;
  *) echo "" ;;
  esac
}

ASSETS=$(gh api "repos/$GITHUB_REPOSITORY/releases/$RELEASE_ID/assets" --paginate)
PLATFORMS=$(jq -n '{}')

while IFS=$'\t' read -r ASSET_ID NAME; do
  BUNDLE="${NAME%.sig}"
  KEYS=$(keys_for "$BUNDLE")
  if [ -z "$KEYS" ]; then
    echo "skipping $BUNDLE: no updater platform claims it"
    continue
  fi
  SIGNATURE=$(gh api "repos/$GITHUB_REPOSITORY/releases/assets/$ASSET_ID" -H "Accept: application/octet-stream")
  URL="https://github.com/$GITHUB_REPOSITORY/releases/download/v$VERSION/$BUNDLE"
  for KEY in $KEYS; do
    PLATFORMS=$(printf '%s' "$PLATFORMS" | jq --arg k "$KEY" --arg u "$URL" --arg s "$SIGNATURE" \
      '.[$k] = {signature: $s, url: $u}')
    echo "$KEY -> $BUNDLE"
  done
done < <(printf '%s' "$ASSETS" | jq -r '.[] | select(.name | endswith(".sig")) | [.id, .name] | @tsv')

printf '%s' "$PLATFORMS" | jq \
  --arg v "$VERSION" \
  --arg d "${PUB_DATE:-$(date -u +%Y-%m-%dT%H:%M:%S.000Z)}" \
  '{version: $v, notes: "", pub_date: $d, platforms: .}' >"$OUTPUT"
