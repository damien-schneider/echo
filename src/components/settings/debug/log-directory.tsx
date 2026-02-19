import { invoke } from "@tauri-apps/api/core";
import type React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SettingContainer } from "@/components/ui/setting-container";

interface LogDirectoryProps {
  descriptionMode?: "tooltip" | "inline";
  grouped?: boolean;
}

export const LogDirectory: React.FC<LogDirectoryProps> = ({
  descriptionMode = "tooltip",
  grouped = false,
}) => {
  const [logDir, setLogDir] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadLogDirectory = async () => {
      try {
        const result = await invoke<string>("get_log_dir_path");
        setLogDir(result);
      } catch (err) {
        const errorMessage =
          err && typeof err === "object" && "message" in err
            ? String(err.message)
            : "Failed to load log directory";
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    loadLogDirectory();
  }, []);

  const handleOpen = async () => {
    if (!logDir) {
      return;
    }
    try {
      await invoke("open_log_dir");
    } catch (openError) {
      console.error("Failed to open log directory:", openError);
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="animate-pulse">
          <div className="h-8 rounded bg-gray-100" />
        </div>
      );
    }
    if (error) {
      return (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-red-600 text-xs">
          Error loading log directory: {error}
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 break-all rounded border border-mid-gray/80 bg-mid-gray/10 px-2 py-2 font-mono text-xs">
          {logDir}
        </div>
        <Button
          className="px-3 py-2"
          disabled={!logDir}
          onClick={handleOpen}
          size="sm"
          variant="secondary"
        >
          Open
        </Button>
      </div>
    );
  };

  return (
    <SettingContainer
      description="Location on disk where Handy writes rotated log files"
      descriptionMode={descriptionMode}
      grouped={grouped}
      layout="stacked"
      title="Log Directory"
    >
      {renderContent()}
    </SettingContainer>
  );
};
