#!/usr/bin/env bun
/**
 * Quits a running production Echo before the dev build starts.
 *
 * Prod and dev are isolated everywhere except the OS-level global shortcut:
 * macOS RegisterEventHotKey is per-process, so both apps would fire on the
 * same key. Quitting prod first avoids that.
 *
 * Runs via the `tauri:dev` script. No-op on non-macOS and when prod isn't running.
 */

import { execFileSync } from "node:child_process";

if (process.platform !== "darwin") {
  process.exit(0);
}

// Match only the installed prod bundle (Echo.app). The dev build runs from
// src-tauri/target/, and the dev bundle would be "Echo Dev.app" — neither
// matches this pattern, so SIGTERM only ever hits production Echo.
try {
  execFileSync("pkill", ["-f", "Echo.app/Contents/MacOS/echo-app"], {
    stdio: "ignore",
  });
  console.log("[quit-prod-echo] Production Echo quit.");
} catch {
  // pkill exits non-zero when nothing matched — expected, not an error.
  console.log("[quit-prod-echo] No production Echo running.");
}
