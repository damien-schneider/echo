import { useAtom, useSetAtom } from "jotai";
import { AlertCircle, Bell, CheckCircle2, Loader2, X } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  clearOldNotificationsAtom,
  type FileNotification,
  notificationsAtom,
  removeNotificationAtom,
} from "@/stores/notification-atoms";

const NotificationItem = ({
  notification,
  onRemove,
}: {
  notification: FileNotification;
  onRemove: (id: string) => void;
}) => {
  const getStatusIcon = () => {
    switch (notification.status) {
      case "processing":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case "complete":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Loader2 className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="group relative flex items-start gap-3 rounded-lg border bg-background p-3 transition-colors hover:bg-muted/50">
      <div className="mt-0.5">{getStatusIcon()}</div>
      <div className="flex-1 space-y-1">
        <p className="font-medium text-sm leading-none">
          {notification.fileName}
        </p>
        <p className="text-muted-foreground text-xs">{notification.message}</p>
        {notification.status === "processing" && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${notification.progress * 100}%` }}
            />
          </div>
        )}
        {notification.error && (
          <p className="text-destructive text-xs">{notification.error}</p>
        )}
      </div>
      <Button
        className="opacity-0 transition-opacity group-hover:opacity-100"
        onClick={() => onRemove(notification.id)}
        size="icon-xs"
        variant="ghost"
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
};

const NOTIFICATION_CLEANUP_INTERVAL_MS = 60_000; // 1 minute

export const NotificationCenter = () => {
  const [notifications, setNotifications] = useAtom(notificationsAtom);
  const removeNotification = useSetAtom(removeNotificationAtom);
  const clearOldNotifications = useSetAtom(clearOldNotificationsAtom);

  useEffect(() => {
    // Clear old notifications every minute
    const interval = setInterval(() => {
      clearOldNotifications();
    }, NOTIFICATION_CLEANUP_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [clearOldNotifications]);

  const activeCount = notifications.filter(
    (n) => n.status === "processing" || n.status === "pending"
  ).length;

  const hasNotifications = notifications.length > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button className="relative" size="icon-sm" variant="ghost">
          <Bell className="h-4 w-4" />
          {activeCount > 0 && (
            <span className="absolute top-0 right-0 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">File Processing</h3>
            {hasNotifications && (
              <Button
                className="h-auto p-1 text-xs"
                onClick={() => setNotifications([])}
                size="sm"
                variant="ghost"
              >
                Clear all
              </Button>
            )}
          </div>
          {hasNotifications ? (
            <div className="space-y-2">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onRemove={removeNotification}
                />
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-muted-foreground text-sm">
              No recent file processing
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
