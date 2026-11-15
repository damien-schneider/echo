#!/usr/bin/env bun
// Usage: bun run version <x.y.z | major|minor|patch>

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const rootDir = join(import.meta.dirname, "..");

const SEMVER_REGEX = /^(\d+)\.(\d+)\.(\d+)$/;
const BUMP_TYPES = ["major", "minor", "patch"] as const;
type BumpType = (typeof BUMP_TYPES)[number];
const VERSION_REGEX = /^(version\s*=\s*")[\d.]+(")/m;

const PACKAGE_JSON = join(rootDir, "package.json");
const CARGO_TOML = join(rootDir, "src-tauri/Cargo.toml");
const TAURI_CONF = join(rootDir, "src-tauri/tauri.conf.json");

function isBumpType(value: string): value is BumpType {
  return BUMP_TYPES.some((type) => type === value);
}

function getCurrentVersion(): string {
  const { version } = JSON.parse(readFileSync(PACKAGE_JSON, "utf-8"));
  if (typeof version !== "string") {
    throw new Error("package.json has no version");
  }
  return version;
}

function parseVersion(version: string): [number, number, number] {
  const match = SEMVER_REGEX.exec(version);
  if (!match) {
    throw new Error(`Invalid version format: ${version}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function bumpVersion(current: string, type: BumpType): string {
  const [major, minor, patch] = parseVersion(current);

  switch (type) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    default:
      return `${major}.${minor}.${patch + 1}`;
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
  // First match = [package] section.
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

  const input = args[0] ?? "";
  let newVersion: string;

  if (isBumpType(input)) {
    const current = getCurrentVersion();
    newVersion = bumpVersion(current, input);
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

  console.log("\n⏳ Running cargo check to update Cargo.lock...");
  execSync("cargo check", {
    cwd: join(rootDir, "src-tauri"),
    stdio: "inherit",
  });
  console.log("✓ Cargo.lock updated");

  console.log("\n⏳ Running ultracite fix...");
  execSync("bunx ultracite fix", {
    cwd: rootDir,
    stdio: "inherit",
  });
  console.log("✓ Formatting applied");
}

main();
