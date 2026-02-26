import { create } from "zustand";

export interface FileTranscriptionItem {
  error?: string;
  fileName: string;
  id: string;
  message: string;
  progress: number;
  status: "extracting" | "processing" | "transcribing" | "complete" | "error";
  text?: string;
  timestamp: number;
}

interface FileTranscriptionStore {
  addItem: (item: FileTranscriptionItem) => void;
  clearCompleted: () => void;
  items: FileTranscriptionItem[];
  removeItem: (id: string) => void;
  updateItem: (id: string, updates: Partial<FileTranscriptionItem>) => void;
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
