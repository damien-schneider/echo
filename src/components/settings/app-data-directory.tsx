import { invoke } from "@tauri-apps/api/core";
import type React from "react";
import { useEffect, useState } from "react";
import { TextDisplay } from "@/components/ui/text-display";

interface AppDataDirectoryProps {
  descriptionMode?: "tooltip" | "inline";
  grouped?: boolean;
}

export const AppDataDirectory: React.FC<AppDataDirectoryProps> = ({
  descriptionMode = "inline",
  grouped = false,
}) => {
  const [appDirPath, setAppDirPath] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const handleCopy = (_value: string) => {
    // Toast notification could be added here
  };

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
    <TextDisplay
      copyable={true}
      description="Main directory where application data, settings, and models are stored"
      descriptionMode={descriptionMode}
      grouped={grouped}
      label="App Data Directory"
      monospace={true}
      onCopy={handleCopy}
      value={appDirPath}
    />
  );
};
