import { listen } from "@tauri-apps/api/event";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { ProgressBar } from "../shared";

interface UpdateCheckerProps {
  className?: string;
}

const UpdateChecker: React.FC<UpdateCheckerProps> = ({ className = "" }) => {
  // Update checking state
  const [isChecking, setIsChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [showUpToDate, setShowUpToDate] = useState(false);

  const upToDateTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const isManualCheckRef = useRef(false);
  const downloadedBytesRef = useRef(0);
  const contentLengthRef = useRef(0);

  // Update checking functions
  const checkForUpdates = useCallback(async () => {
    if (isChecking) {
      return;
    }

    try {
      setIsChecking(true);
      const update = await check();

      if (update) {
        setUpdateAvailable(true);
        setShowUpToDate(false);
      } else {
        setUpdateAvailable(false);

        if (isManualCheckRef.current) {
          setShowUpToDate(true);
          if (upToDateTimeoutRef.current) {
            clearTimeout(upToDateTimeoutRef.current);
          }
          upToDateTimeoutRef.current = setTimeout(() => {
            setShowUpToDate(false);
          }, 3000);
        }
      }
    } catch (error) {
      console.error("Failed to check for updates:", error);
    } finally {
      setIsChecking(false);
      isManualCheckRef.current = false;
    }
  }, []);

  const handleManualUpdateCheck = useCallback(() => {
    isManualCheckRef.current = true;
    checkForUpdates();
  }, [checkForUpdates]);

  useEffect(() => {
    checkForUpdates();

    // Listen for update check events
    const updateUnlisten = listen("check-for-updates", () => {
      handleManualUpdateCheck();
    });

    return () => {
      if (upToDateTimeoutRef.current) {
        clearTimeout(upToDateTimeoutRef.current);
      }
      updateUnlisten.then((fn) => fn());
    };
  }, [checkForUpdates, handleManualUpdateCheck]);

  const installUpdate = async () => {
    try {
      setIsInstalling(true);
      setDownloadProgress(0);
      downloadedBytesRef.current = 0;
      contentLengthRef.current = 0;
      const update = await check();

      if (!update) {
        console.log("No update available during install attempt");
        return;
      }

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            downloadedBytesRef.current = 0;
            contentLengthRef.current = event.data.contentLength ?? 0;
            break;
          case "Progress": {
            downloadedBytesRef.current += event.data.chunkLength;
            const progress =
              contentLengthRef.current > 0
                ? Math.round(
                    (downloadedBytesRef.current / contentLengthRef.current) *
                      100
                  )
                : 0;
            setDownloadProgress(Math.min(progress, 100));
            break;
          }
        }
      });
      await relaunch();
    } catch (error) {
      console.error("Failed to install update:", error);
    } finally {
      setIsInstalling(false);
      setDownloadProgress(0);
      downloadedBytesRef.current = 0;
      contentLengthRef.current = 0;
    }
  };

  // Update status functions
  const getUpdateStatusText = () => {
    if (isInstalling) {
      return downloadProgress > 0 && downloadProgress < 100
        ? `Downloading... ${downloadProgress.toString().padStart(3)}%`
        : downloadProgress === 100
          ? "Installing..."
          : ""; // preparing handled by spinner only
    }
    if (showUpToDate) {
      return "Up to date";
    }
    if (updateAvailable) {
      return "Update available";
    }
    return "Check for updates";
  };

  const getUpdateStatusAction = () => {
    if (updateAvailable && !isInstalling) {
      return installUpdate;
    }
    if (!(isChecking || isInstalling || updateAvailable)) {
      return handleManualUpdateCheck;
    }
    return;
  };

  const isUpdateDisabled = isChecking || isInstalling || showUpToDate;
  const isUpdateClickable =
    !isUpdateDisabled && (updateAvailable || !isChecking);

  const showSpinner = isChecking || (isInstalling && downloadProgress === 0);

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative">
        <Button
          className={cn(
            "min-w-32 items-center gap-2",
            updateAvailable
              ? "font-medium text-brand hover:text-brand/80"
              : "text-text/60 hover:text-text/80"
          )}
          disabled={!isUpdateClickable}
          onClick={getUpdateStatusAction()}
          size="xs"
          variant="ghost"
        >
          {showSpinner ? (
            <Spinner className="size-3" />
          ) : (
            <span className="tabular-nums">{getUpdateStatusText()}</span>
          )}
        </Button>
      </div>

      {isInstalling && downloadProgress > 0 && downloadProgress < 100 && (
        <ProgressBar
          progress={[
            {
              id: "update",
              percentage: downloadProgress,
            },
          ]}
          size="large"
        />
      )}
    </div>
  );
};

export default UpdateChecker;
