import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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
