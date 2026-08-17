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

const releaseBase =
  "https://github.com/ggml-org/llama.cpp/releases/download/b9974";

const artifacts = [
  {
    arch: "arm64",
    filename: "llama-b9974-bin-macos-arm64.tar.gz",
    platform: "darwin",
    sha256: "e43c8fbb0891f61e5e0ae2a3432eeb5d1ce5d2aeda547b7d3bc570a3ea4d272a",
  },
  {
    arch: "x64",
    filename: "llama-b9974-bin-macos-x64.tar.gz",
    platform: "darwin",
    sha256: "f6eb2c60940b73dbe70287d31d9538c4f9a1499b582b487b5ca3c061387c7dbd",
  },
  {
    arch: "arm64",
    filename: "llama-b9974-bin-ubuntu-vulkan-arm64.tar.gz",
    platform: "linux",
    sha256: "e2d2476c1229c7b696696c26e849c3e8a241210b2bd9b810ddac1f02feebfef3",
  },
  {
    arch: "x64",
    filename: "llama-b9974-bin-ubuntu-vulkan-x64.tar.gz",
    platform: "linux",
    sha256: "6b5557b3093a908d72573e94741aeb5d20949f97565c87fad8274648ece970a5",
  },
  {
    arch: "arm64",
    filename: "llama-b9974-bin-win-cpu-arm64.zip",
    platform: "win32",
    sha256: "b9173f3f2876bf18e4ea90cdd99fa919b2eaeef992809eb5189af4804ce57085",
  },
  {
    arch: "x64",
    filename: "llama-b9974-bin-win-vulkan-x64.zip",
    platform: "win32",
    sha256: "184cc4ec85166a99588f723b6431963a3e6f4fa9f66fcce868d1c3cbeae44745",
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
  "libllama-common.0.dylib",
  "libmtmd.0.dylib",
  "libllama.0.dylib",
  "libggml.0.dylib",
  "libggml-cpu.0.dylib",
  "libggml-blas.0.dylib",
  "libggml-metal.0.dylib",
  "libggml-rpc.0.dylib",
  "libggml-base.0.dylib",
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
  `Prepared llama.cpp b9974 (${executableHash.slice(0, 12)})\n`
);
