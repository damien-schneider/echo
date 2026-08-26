# Releasing

Echo ships via GitHub Actions. Two workflows: `release-dryrun` (test) and `release` (publish).

## TL;DR

```bash
bun run ci:bundle        # 1. local check (~15 min, your arch only)
bun run release:dryrun   # 2. CI check on all 6 platforms (no tag, no upload)
bun run version minor    # 3. bump 0.x.0 (or patch / major / x.y.z)
git push                 # 4. push the bump commit
bun run release:start    # 5. tag + build + draft release
# 6. review the draft on GitHub → Publish
```

## Pre-flight (local)

| Command | What | Time |
|---|---|---|
| `bun run format` | `ultracite fix` — write fixes (also runs in pre-commit hook) | ~1 s |
| `bun run lint` | `ultracite check` — read-only lint | ~1 s |
| `bun run ci:local` | typecheck + vite build + `cargo check` | ~30 s |
| `bun run ci:bundle` | `ci:local` + `tauri build` (your arch only) | ~15 min |

`ci:bundle` is the closest local equivalent to CI — runs the exact same `tauri build` step, skips signing only.

## Pre-flight (CI, all platforms)

```bash
bun run release:dryrun   # = gh workflow run release-dryrun.yml --ref <current branch>
```

Builds the full 6-platform matrix (macOS arm64/x64, Linux deb/appimage+rpm, Windows x64/arm64) without tagging, drafting, or uploading. `fail-fast: false` — see every platform's failure in one run.

## Releasing

1. Bump version — updates `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` and refreshes `Cargo.lock`:

   ```bash
   bun run version patch     # 0.4.0 → 0.4.1
   bun run version minor     # 0.4.0 → 0.5.0
   bun run version major     # 0.4.0 → 1.0.0
   bun run version 1.2.3     # explicit
   ```

2. Commit + push the bump on `main`.

3. Trigger the release:

   ```bash
   bun run release:start     # = gh workflow run release.yml --ref main
   ```

   Or via GitHub UI: Actions → Release → Run workflow.

4. The workflow:
   - Verifies `v<version>` tag is free.
   - Creates the tag, pushes it, drafts a release with autogen notes.
   - Builds + signs the 6-platform matrix and uploads bundles + updater `.sig` files to the draft.
   - On any failure, `cleanup-on-failure` deletes the draft and the tag — re-run after fixing.

5. Open the draft on GitHub, review the assets and notes, hit **Publish**. The Tauri updater reads the published release's `latest.json`.

## What clients do with a published release

`src-tauri/src/updates/` owns the whole client side — one snapshot (`phase`,
`version`, `progress`, `error`) published to every window on the `update-status`
event.

- Checks run 20 s after startup, then every 6 h, plus on demand from the tray
  ("Check for updates") or the app window. A failed automatic check stays in the
  log; a failed manual one is shown.
- The app window shows the offer next to the version badge; the notch shows it
  for 15 s with an **Update** button, then steps aside (dismissing it hides that
  version until a newer one ships).
- Installing downloads with progress, verifies the minisign signature, then
  restarts. A failure keeps the version so the same button becomes **Retry**.

## Required GitHub secrets

- `TAURI_SIGNING_PRIVATE_KEY` (+ `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if set) — updater signing, all platforms.
- `APPLE_ID`, `APPLE_ID_PASSWORD` (or `APPLE_PASSWORD`), `APPLE_TEAM_ID`, `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `KEYCHAIN_PASSWORD` — macOS notarization + signing.
- `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID` — Windows trusted signing (currently disabled, see `release.yml` TODO).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Tag vX.Y.Z already exists` | Bump again — version was not incremented. |
| One platform fails mid-release | Cleanup ran — the draft and tag were deleted. Fix the failing platform, re-run `release:start`. |
| Updater clients don't see the new version | Draft was never published — open the release on GitHub and click Publish. |
| Downloaded `.dmg` refused by Gatekeeper | Only affects v0.8.0 and earlier — the image is notarized and stapled from v0.8.1 on. |
| Local `tauri build` cmake error on macOS | `CMAKE_POLICY_VERSION_MINIMUM=3.5 bun run tauri:build`. |

## Database schema bumps

`CURRENT_SCHEMA_VERSION` in `src-tauri/src/managers/database.rs` is a one-way door for anyone
running v0.8.0 or older: those builds refuse to open a database stamped with a version they do not
know, and abort at startup. From v0.8.1 an unknown version is only a warning, so a bump is safe for
every build from there on. Migrations must stay additive — a rename or a drop breaks the older
build's queries, which no version check can catch.
