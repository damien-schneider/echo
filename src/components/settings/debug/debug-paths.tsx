import type React from "react";
import { SettingContainer } from "@/components/ui/setting-container";

interface DebugPathsProps {
  descriptionMode?: "tooltip" | "inline";
  grouped?: boolean;
}

export const DebugPaths: React.FC<DebugPathsProps> = ({
  descriptionMode = "inline",
  grouped = false,
}) => (
  <SettingContainer
    description="Display internal file paths and directories for debugging purposes"
    descriptionMode={descriptionMode}
    grouped={grouped}
    title="Debug Paths"
  >
    <div className="space-y-2 text-gray-600 text-sm">
      <div>
        <span className="font-medium">App Data:</span>{" "}
        <span className="font-mono text-xs">%APPDATA%/echo</span>
      </div>
      <div>
        <span className="font-medium">Models:</span>{" "}
        <span className="font-mono text-xs">%APPDATA%/echo/models</span>
      </div>
      <div>
        <span className="font-medium">Settings:</span>{" "}
        <span className="font-mono text-xs">
          %APPDATA%/echo/settings_store.json
        </span>
      </div>
    </div>
  </SettingContainer>
);
