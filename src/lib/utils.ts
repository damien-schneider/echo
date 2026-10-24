import { withControlUiMerge } from "@ctrl-ui/react/lib/cn";
import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge(withControlUiMerge);

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Tauri commands reject with plain strings, not Error instances.
export function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.length > 0) {
    return error;
  }
  return error instanceof Error ? error.message : fallback;
}
