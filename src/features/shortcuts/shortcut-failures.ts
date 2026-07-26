import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { z } from "zod";

/// Mirrors the Rust `ShortcutFailure`: the OS refused the combination, so the
/// shortcut silently does nothing until the user picks another one.
export const ShortcutFailureSchema = z.object({
  binding: z.string(),
  bindingId: z.string(),
  reason: z.string(),
});

export type ShortcutFailure = z.infer<typeof ShortcutFailureSchema>;

export const parseShortcutFailure = (
  payload: unknown
): ShortcutFailure | null => {
  const parsed = ShortcutFailureSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
};

export const shortcutFailureMessage = ({
  binding,
  reason,
}: ShortcutFailure): string => {
  const cause = reason ? `: ${reason}` : "";
  return `Shortcut ${binding} is not active — another app already owns it${cause}.`;
};

/// Registration runs before any window exists, so a window that just opened
/// reads what it missed instead of waiting for an event that already fired.
export const readShortcutFailures = async (): Promise<ShortcutFailure[]> => {
  const failures = await invoke<unknown>("get_shortcut_failures");
  return z.array(ShortcutFailureSchema).parse(failures);
};

export const subscribeShortcutFailures = (
  onFailure: (failure: ShortcutFailure) => void
): Promise<UnlistenFn> =>
  listen<unknown>("shortcut-registration-failed", (event) => {
    const failure = parseShortcutFailure(event.payload);
    if (failure) {
      onFailure(failure);
    }
  });
