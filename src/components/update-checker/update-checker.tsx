import { listen } from "@tauri-apps/api/event";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { RefreshCw } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import ProgressBar from "@/components/shared/progress-bar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface UpdateCheckerProps {
  className?: string;
}

const UpdateChecker: React.FC<UpdateCheckerProps> = ({ className = "" }) => {
  const [isChecking, setIsChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [showUpToDate, setShowUpToDate] = useState(false);

  const upToDateTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const isManualCheckRef = useRef(false);
  const isCheckingRef = useRef(false);
  const downloadedBytesRef = useRef(0);
  const contentLengthRef = useRef(0);

  const checkForUpdates = useCallback(async () => {
    if (isCheckingRef.current) {
      return;
    }

    try {
      isCheckingRef.current = true;
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
      isCheckingRef.current = false;
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
          default:
            break;
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
  const isDownloading =
    isInstalling && downloadProgress > 0 && downloadProgress < 100;
  const showStatusText = updateAvailable || showUpToDate;

  const renderIconButton = () => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            className="text-muted-foreground hover:text-foreground"
            disabled={!isUpdateClickable}
            onClick={getUpdateStatusAction()}
            size="xs"
            variant="ghost"
          >
            {showSpinner ? (
              <Spinner className="size-3!" />
            ) : (
              <RefreshCw className="size-3!" />
            )}
            <span className="sr-only">Check for updates</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {showSpinner ? "Checking..." : "Check for updates"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  const renderStatusText = () => (
    <Button
      className={cn(
        "items-center gap-2",
        updateAvailable
          ? "text-brand hover:text-brand/80"
          : "text-muted-foreground"
      )}
      disabled={!isUpdateClickable}
      onClick={getUpdateStatusAction()}
      size="xs"
      variant="ghost"
    >
      {updateAvailable ? "Update available" : "Up to date"}
    </Button>
  );

  const renderProgressBar = () => (
    <ProgressBar
      progress={[{ id: "update", percentage: downloadProgress }]}
      size="large"
    />
  );

  const renderContent = () => {
    if (isDownloading) {
      return renderProgressBar();
    }
    if (showStatusText) {
      return renderStatusText();
    }
    return renderIconButton();
  };

  return (
    <div className={cn("flex items-center", className)}>{renderContent()}</div>
  );
};

export default UpdateChecker;
