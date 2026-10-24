import { useCopyToClipboard } from "@ctrl-ui/react/hooks/use-copy-to-clipboard";
import { Button } from "@ctrl-ui/react/ui/button";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import type React from "react";
import { useEffect, useState } from "react";
import { SettingRow } from "@/features/settings/setting-row";
export const AppDataDirectory: React.FC = () => {
  const [appDirPath, setAppDirPath] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { status: copyStatus, handleCopy } = useCopyToClipboard({
    text: appDirPath,
  });
  useEffect(() => {
    const loadAppDirectory = async () => {
      try {
        const result = await invoke<string>("get_app_dir_path");
        setAppDirPath(result);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load app directory"
        );
      } finally {
        setLoading(false);
      }
    };
    loadAppDirectory();
  }, []);
  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="mb-2 h-4 w-1/3 rounded bg-gray-200" />
        <div className="h-8 rounded bg-gray-100" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-red-600 text-sm">
          Error loading app directory: {error}
        </p>
      </div>
    );
  }
  return (
    <SettingRow
      description="Main directory where application data, settings, and models are stored"
      layout="stacked"
      title="App Data Directory"
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 break-all rounded-lg border border-border/80 bg-muted/10 px-2 py-2 font-mono text-xs">
          {appDirPath}
        </div>
        <Button
          aria-label="Copy app data directory"
          iconOnly
          onClick={handleCopy}
          size="xs"
          variant="ghost"
        >
          {copyStatus === "copied" ? (
            <CheckIcon className="size-4" />
          ) : (
            <CopyIcon className="size-4" />
          )}
        </Button>
      </div>
    </SettingRow>
  );
};
