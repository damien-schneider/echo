import { platform as tauriPlatform } from "@tauri-apps/plugin-os";

export type OsPlatform = "mac" | "windows" | "linux";

let cachedPlatform: OsPlatform | null = null;

const navigatorPlatform = (): OsPlatform => {
  if (typeof navigator === "undefined") {
    return "windows";
  }

  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes("mac os x")) {
    return "mac";
  }
  if (userAgent.includes("win")) {
    return "windows";
  }
  return "linux";
};

const tauriOsPlatform = (): OsPlatform | null => {
  try {
    switch (tauriPlatform()) {
      case "macos":
        return "mac";
      case "windows":
        return "windows";
      case "linux":
        return "linux";
      default:
        return null;
    }
  } catch (error) {
    console.error("Failed to determine raw OS platform", error);
    return null;
  }
};

export function getNormalizedOsPlatform(): OsPlatform {
  cachedPlatform ??= tauriOsPlatform() ?? navigatorPlatform();
  return cachedPlatform;
}
