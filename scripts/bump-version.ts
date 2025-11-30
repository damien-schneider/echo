#!/usr/bin/env bun
/**
 * Script to bump the version across all configuration files:
 * - package.json
 * - src-tauri/Cargo.toml
 * - src-tauri/tauri.conf.json
 *
 * Usage:
 *   bun run version <version>
 *   bun run version 1.0.0
 *   bun run version patch|minor|major
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const rootDir = join(import.meta.dirname, "..");

const VERSION_REGEX = /^(version\s*=\s*")[\d.]+(")/m;
const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;

const PACKAGE_JSON = join(rootDir, "package.json");
const CARGO_TOML = join(rootDir, "src-tauri/Cargo.toml");
const TAURI_CONF = join(rootDir, "src-tauri/tauri.conf.json");

function getCurrentVersion(): string {
  const packageJson = JSON.parse(readFileSync(PACKAGE_JSON, "utf-8"));
  return packageJson.version;
}

function parseVersion(version: string): [number, number, number] {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    throw new Error(`Invalid version format: ${version}`);
  }
  return parts as [number, number, number];
}

function bumpVersion(
  current: string,
  type: "major" | "minor" | "patch"
): string {
  const [major, minor, patch] = parseVersion(current);

  switch (type) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Unknown bump type: ${type}`);
  }
}

function updatePackageJson(version: string): void {
  const content = JSON.parse(readFileSync(PACKAGE_JSON, "utf-8"));
  content.version = version;
  writeFileSync(PACKAGE_JSON, `${JSON.stringify(content, null, 2)}\n`);
  console.log(`✓ Updated package.json to ${version}`);
}

function updateCargoToml(version: string): void {
  let content = readFileSync(CARGO_TOML, "utf-8");
  // Match version in [package] section (first occurrence)
  content = content.replace(VERSION_REGEX, `$1${version}$2`);
  writeFileSync(CARGO_TOML, content);
  console.log(`✓ Updated Cargo.toml to ${version}`);
}

function updateTauriConf(version: string): void {
  const content = JSON.parse(readFileSync(TAURI_CONF, "utf-8"));
  content.version = version;
  writeFileSync(TAURI_CONF, `${JSON.stringify(content, null, 2)}\n`);
  console.log(`✓ Updated tauri.conf.json to ${version}`);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`Current version: ${getCurrentVersion()}`);
    console.log("\nUsage:");
    console.log(
      "  bun run version <version>   Set specific version (e.g., 1.0.0)"
    );
    console.log("  bun run version patch       Bump patch version (0.0.x)");
    console.log("  bun run version minor       Bump minor version (0.x.0)");
    console.log("  bun run version major       Bump major version (x.0.0)");
    process.exit(0);
  }

  const input = args[0];
  let newVersion: string;

  if (["major", "minor", "patch"].includes(input)) {
    const current = getCurrentVersion();
    newVersion = bumpVersion(current, input as "major" | "minor" | "patch");
    console.log(`Bumping ${input}: ${current} → ${newVersion}\n`);
  } else if (SEMVER_REGEX.test(input)) {
    newVersion = input;
    console.log(`Setting version to ${newVersion}\n`);
  } else {
    console.error(`Error: Invalid version format "${input}"`);
    console.error("Expected: x.y.z or major|minor|patch");
    process.exit(1);
  }

  updatePackageJson(newVersion);
  updateCargoToml(newVersion);
  updateTauriConf(newVersion);

  console.log(`\n✓ All files updated to version ${newVersion}`);

  // Run cargo check to update Cargo.lock
  console.log("\n⏳ Running cargo check to update Cargo.lock...");
  execSync("cargo check", {
    cwd: join(rootDir, "src-tauri"),
    stdio: "inherit",
  });
  console.log("✓ Cargo.lock updated");
}

main();
