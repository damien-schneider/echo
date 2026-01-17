import { atom } from "jotai";

export interface FileNotification {
  id: string;
  fileName: string;
  status: "pending" | "processing" | "complete" | "error";
  progress: number;
  message: string;
  timestamp: number;
  error?: string;
}

export const notificationsAtom = atom<FileNotification[]>([]);

export const addNotificationAtom = atom(
  null,
  (get, set, notification: Omit<FileNotification, "id" | "timestamp">) => {
    const notifications = get(notificationsAtom);
    const newNotification: FileNotification = {
      ...notification,
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
    };
    set(notificationsAtom, [...notifications, newNotification]);
    return newNotification.id;
  }
);

export const updateNotificationAtom = atom(
  null,
  (
    get,
    set,
    update: {
      id: string;
      status?: FileNotification["status"];
      progress?: number;
      message?: string;
      error?: string;
    }
  ) => {
    const notifications = get(notificationsAtom);
    set(
      notificationsAtom,
      notifications.map((n) =>
        n.id === update.id ? { ...n, ...update } : n
      )
    );
  }
);

export const removeNotificationAtom = atom(null, (get, set, id: string) => {
  const notifications = get(notificationsAtom);
  set(
    notificationsAtom,
    notifications.filter((n) => n.id !== id)
  );
});

export const clearOldNotificationsAtom = atom(null, (get, set) => {
  const notifications = get(notificationsAtom);
  const now = Date.now();
  const FIVE_MINUTES = 5 * 60 * 1000;
  
  set(
    notificationsAtom,
    notifications.filter(
      (n) =>
        n.status === "processing" ||
        n.status === "pending" ||
        now - n.timestamp < FIVE_MINUTES
    )
  );
});
