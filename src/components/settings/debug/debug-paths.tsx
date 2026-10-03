import type React from "react";
import { SettingRow } from "@/features/settings/setting-row";
export const DebugPaths: React.FC = () => (
  <SettingRow
    description="Display internal file paths and directories for debugging purposes"
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
  </SettingRow>
);
