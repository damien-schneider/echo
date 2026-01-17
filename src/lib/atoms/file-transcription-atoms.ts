import { atom } from "jotai";

export interface FileTranscriptionItem {
  id: string;
  fileName: string;
  status: "extracting" | "processing" | "transcribing" | "complete" | "error";
  progress: number;
  message: string;
  text?: string;
  timestamp: number;
  error?: string;
}

export const fileTranscriptionsAtom = atom<FileTranscriptionItem[]>([]);

export const addFileTranscriptionAtom = atom(
  null,
  (get, set, item: FileTranscriptionItem) => {
    set(fileTranscriptionsAtom, [...get(fileTranscriptionsAtom), item]);
  }
);

export const updateFileTranscriptionAtom = atom(
  null,
  (
    get,
    set,
    update: { id: string; updates: Partial<FileTranscriptionItem> }
  ) => {
    const items = get(fileTranscriptionsAtom);
    set(
      fileTranscriptionsAtom,
      items.map((item) =>
        item.id === update.id ? { ...item, ...update.updates } : item
      )
    );
  }
);

export const removeFileTranscriptionAtom = atom(
  null,
  (get, set, id: string) => {
    const items = get(fileTranscriptionsAtom);
    set(
      fileTranscriptionsAtom,
      items.filter((item) => item.id !== id)
    );
  }
);

export const clearCompletedTranscriptionsAtom = atom(null, (get, set) => {
  const items = get(fileTranscriptionsAtom);
  set(
    fileTranscriptionsAtom,
    items.filter(
      (item) => item.status !== "complete" && item.status !== "error"
    )
  );
});
