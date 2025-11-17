import { platform as tauriPlatform } from "@tauri-apps/plugin-os";

export type RawOsPlatform = ReturnType<typeof tauriPlatform>;
export type OsPlatform = "mac" | "windows" | "linux";

let cachedRawPlatform: RawOsPlatform | null = null;
let cachedNormalizedPlatform: OsPlatform | null = null;

const navigatorNormalizedPlatform = (): OsPlatform => {
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

const normalizeOsType = (osType: RawOsPlatform | null): OsPlatform | null => {
  switch (osType) {
    case "macos":
      return "mac";
    case "windows":
      return "windows";
    case "linux":
      return "linux";
    default:
      return null;
  }
};

export function getRawOsPlatform(): RawOsPlatform | null {
  if (cachedRawPlatform) {
    return cachedRawPlatform;
  }

  try {
    const rawPlatform = tauriPlatform();
    cachedRawPlatform = rawPlatform;
    return rawPlatform;
  } catch (error) {
    console.error("Failed to determine raw OS platform", error);
    return null;
  }
}

export function getNormalizedOsPlatform(): OsPlatform {
  if (cachedNormalizedPlatform) {
    return cachedNormalizedPlatform;
  }

  const normalized = normalizeOsType(getRawOsPlatform());
  if (normalized) {
    cachedNormalizedPlatform = normalized;
    return normalized;
  }

  const fallback = navigatorNormalizedPlatform();
  cachedNormalizedPlatform = fallback;
  return fallback;
}
