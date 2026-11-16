import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import type { HistoryEntry } from "@/components/settings/history/history-entry-component";
import type { InputEntry } from "@/components/settings/history/keyboard-input-entry";
import { errorMessage } from "@/lib/utils";

export type EntriesLoad<T> =
  | { status: "loading" }
  | { message: string; status: "failed" }
  | { entries: T[]; status: "loaded" };

const loadEntries = async <T>(
  fetchEntries: () => Promise<T[]>
): Promise<EntriesLoad<T>> => {
  try {
    return { entries: await fetchEntries(), status: "loaded" };
  } catch (error) {
    return {
      message: errorMessage(error, "Try again in a moment"),
      status: "failed",
    };
  }
};

export const loadHistory = () =>
  loadEntries(() => invoke<HistoryEntry[]>("get_history_entries"));

export const loadInputEntries = () =>
  loadEntries(() => invoke<InputEntry[]>("get_input_entries", { limit: 100 }));

export const tellOnFailure = async (
  action: () => Promise<unknown>,
  fallback: string
): Promise<boolean> => {
  try {
    await action();
    return true;
  } catch (error) {
    toast.error(errorMessage(error, fallback));
    return false;
  }
};

export const toggleSaved = (id: number) =>
  tellOnFailure(
    () => invoke("toggle_history_entry_saved", { id }),
    "Couldn't update the star — try again"
  );

export const deleteHistoryEntry = (id: number) =>
  tellOnFailure(
    () => invoke("delete_history_entry", { id }),
    "Couldn't delete the entry — try again"
  );

export const retranscribeEntry = (id: number) =>
  tellOnFailure(
    () => invoke("retranscribe_history_entry", { id }),
    "Couldn't retranscribe the entry — try again"
  );

export const openRecordingsFolder = () =>
  tellOnFailure(
    () => invoke("open_recordings_folder"),
    "Couldn't open the recordings folder — try again"
  );

export const deleteInputEntry = (id: number) =>
  tellOnFailure(
    () => invoke("delete_input_entry", { id }),
    "Couldn't delete the entry — try again"
  );

export const clearInputEntries = () =>
  tellOnFailure(
    () => invoke("clear_all_input_entries"),
    "Couldn't clear the keyboard inputs — try again"
  );

export const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    toast.error("Couldn't copy the text — try again");
    return false;
  }
};
