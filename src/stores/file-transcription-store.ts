import { create } from "zustand";

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

interface FileTranscriptionStore {
  items: FileTranscriptionItem[];
  addItem: (item: FileTranscriptionItem) => void;
  updateItem: (id: string, updates: Partial<FileTranscriptionItem>) => void;
  removeItem: (id: string) => void;
  clearCompleted: () => void;
}

export const useFileTranscriptionStore = create<FileTranscriptionStore>(
  (set) => ({
    items: [],

    addItem: (item) => {
      set((state) => ({ items: [...state.items, item] }));
    },

    updateItem: (id, updates) => {
      set((state) => ({
        items: state.items.map((item) =>
          item.id === id ? { ...item, ...updates } : item
        ),
      }));
    },

    removeItem: (id) => {
      set((state) => ({
        items: state.items.filter((item) => item.id !== id),
      }));
    },

    clearCompleted: () => {
      set((state) => ({
        items: state.items.filter(
          (item) => item.status !== "complete" && item.status !== "error"
        ),
      }));
    },
  })
);
