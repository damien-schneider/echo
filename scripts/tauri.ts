import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
if (args[0] === "dev" && !args.includes("--config")) {
  args.splice(1, 0, "--config", "src-tauri/tauri.dev.conf.json");
}

const result = spawnSync("bunx", ["tauri", ...args], { stdio: "inherit" });
process.exit(result.status ?? 1);
