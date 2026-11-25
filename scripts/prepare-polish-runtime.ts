import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

// llama.cpp v1.0.0 delegates its release binaries to this build (nightly-tag.txt).
const release = "b12359";
const releaseBase = `https://github.com/ggml-org/llama.cpp/releases/download/${release}`;

const artifacts = [
  {
    arch: "arm64",
    filename: `llama-${release}-bin-macos-arm64.tar.gz`,
    platform: "darwin",
    sha256: "82b00abc740160e1b9980e6cc79c117345fa34af058c80e6c0a69aa8ddccde75",
  },
  {
    arch: "x64",
    filename: `llama-${release}-bin-macos-x64.tar.gz`,
    platform: "darwin",
    sha256: "25320d529077ef5a3d16e7b5da26438f221d88c8c0930a32b0c79457f5eede56",
  },
  {
    arch: "arm64",
    filename: `llama-${release}-bin-ubuntu-vulkan-arm64.tar.gz`,
    platform: "linux",
    sha256: "3f8ae812a58ac92e5a596ca9fbc988f52854d147c5a7fe1264dddc90c1d085b4",
  },
  {
    arch: "x64",
    filename: `llama-${release}-bin-ubuntu-vulkan-x64.tar.gz`,
    platform: "linux",
    sha256: "19b60f00395a3f4954e46a5037695bc1d843404fc9d3124f82a612ecd8fbe9f0",
  },
  {
    arch: "arm64",
    filename: `llama-${release}-bin-win-cpu-arm64.zip`,
    platform: "win32",
    sha256: "d27564c754478d2832789dfcebfc5ace018e36a224c41d810b7cbc1ba8243ec0",
  },
  {
    arch: "x64",
    filename: `llama-${release}-bin-win-vulkan-x64.zip`,
    platform: "win32",
    sha256: "e8d18c6e4210cca87e7307c2ea78363ac8d158e4e1397358ec96ab70b53a0d5e",
  },
] satisfies ReadonlyArray<{
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
  filename: string;
  sha256: string;
}>;

const targetSchema = z.string().min(1).optional();
const target = targetSchema.parse(process.env.POLISH_RUNTIME_TARGET);

const resolvePlatform = (triple: string | undefined): NodeJS.Platform => {
  if (triple?.includes("apple-darwin")) {
    return "darwin";
  }
  if (triple?.includes("windows-msvc")) {
    return "win32";
  }
  if (triple?.includes("linux-gnu")) {
    return "linux";
  }
  return process.platform;
};

const resolveArchitecture = (
  triple: string | undefined
): NodeJS.Architecture => {
  if (triple?.startsWith("aarch64")) {
    return "arm64";
  }
  if (triple?.startsWith("x86_64")) {
    return "x64";
  }
  return process.arch;
};

const requestedPlatform = resolvePlatform(target);
const requestedArch = resolveArchitecture(target);
const artifact = artifacts.find(
  (candidate) =>
    candidate.platform === requestedPlatform && candidate.arch === requestedArch
);

if (!artifact) {
  throw new Error(
    `Polish runtime is unavailable for ${requestedPlatform}-${requestedArch}`
  );
}

const root = process.cwd();
const cacheDirectory = join(root, "src-tauri", ".polish-runtime-cache");
const archivePath = join(cacheDirectory, artifact.filename);
const outputDirectory = join(root, "src-tauri", "resources", "polish-runtime");
const serverName =
  requestedPlatform === "win32" ? "llama-server.exe" : "llama-server";
const outputServer = join(outputDirectory, serverName);
const execFileAsync = promisify(execFile);
const runtimeLayoutVersion = "minimal-v1";
const markerPath = join(cacheDirectory, "prepared-runtime");
const markerValue = `${artifact.sha256}:${runtimeLayoutVersion}`;

const sha256 = async (path: string) => {
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
};

const pathExists = async (path: string) =>
  stat(path)
    .then(() => true)
    .catch(() => false);

const findFile = async (
  directory: string,
  filename: string
): Promise<string | undefined> => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isFile() && entry.name === filename) {
      return path;
    }
    if (entry.isDirectory()) {
      const nested = await findFile(path, filename);
      if (nested) {
        return nested;
      }
    }
  }
};

const downloadArchive = async () => {
  await mkdir(cacheDirectory, { recursive: true });
  if (
    (await pathExists(archivePath)) &&
    (await sha256(archivePath)) === artifact.sha256
  ) {
    return;
  }
  const response = await fetch(`${releaseBase}/${artifact.filename}`);
  if (!response.ok) {
    throw new Error(
      `Failed to download Polish runtime: HTTP ${response.status}`
    );
  }
  await writeFile(archivePath, Buffer.from(await response.arrayBuffer()));
  const actualHash = await sha256(archivePath);
  if (actualHash !== artifact.sha256) {
    await rm(archivePath, { force: true });
    throw new Error(`Polish runtime checksum mismatch: ${actualHash}`);
  }
};

const extractRuntime = async () => {
  const temporaryDirectory = join(cacheDirectory, "extracting");
  await rm(temporaryDirectory, { force: true, recursive: true });
  await mkdir(temporaryDirectory, { recursive: true });
  await execFileAsync("tar", ["-xf", archivePath, "-C", temporaryDirectory]);
  const server = await findFile(temporaryDirectory, serverName);
  if (!server) {
    throw new Error(`${serverName} is missing from ${basename(archivePath)}`);
  }
  const runtimeDirectory = dirname(server);
  await rm(outputDirectory, { force: true, recursive: true });
  await mkdir(outputDirectory, { recursive: true });
  for (const entry of await readdir(runtimeDirectory, {
    withFileTypes: true,
  })) {
    if (isRuntimeFile(entry.name)) {
      await cp(
        join(runtimeDirectory, entry.name),
        join(outputDirectory, entry.name),
        {
          dereference: true,
          recursive: true,
        }
      );
    }
  }
  if (requestedPlatform !== "win32") {
    await chmod(outputServer, 0o755);
  }
  await rm(temporaryDirectory, { force: true, recursive: true });
};

const verifyRuntime = async () => {
  if (
    requestedPlatform !== process.platform ||
    requestedArch !== process.arch
  ) {
    return;
  }
  await execFileAsync(outputServer, ["--version"], {
    cwd: outputDirectory,
    timeout: 30_000,
  });
};

const isRuntimeFile = (name: string) =>
  requestedPlatform === "darwin"
    ? macRuntimeFiles.has(name)
    : name === serverName ||
      name === "LICENSE" ||
      name.endsWith(".dll") ||
      name.includes(".so") ||
      name.endsWith(".metal") ||
      name.endsWith(".metallib") ||
      name.endsWith(".spv");

const macRuntimeFiles = new Set([
  "LICENSE",
  "llama-server",
  "libllama-server-impl.dylib",
  "libllama-common.1.dylib",
  "libmtmd.1.dylib",
  "libllama.1.dylib",
  "libggml.1.dylib",
  "libggml-cpu.1.dylib",
  "libggml-blas.1.dylib",
  "libggml-metal.1.dylib",
  "libggml-rpc.1.dylib",
  "libggml-base.1.dylib",
]);

await downloadArchive();
const preparedMarker = await readFile(markerPath, "utf8").catch(() => "");
if (preparedMarker !== markerValue || !(await pathExists(outputServer))) {
  await extractRuntime();
  await writeFile(markerPath, markerValue);
}

await verifyRuntime();

const executableHash = await sha256(outputServer);
process.stdout.write(
  `Prepared llama.cpp ${release} (${executableHash.slice(0, 12)})\n`
);
