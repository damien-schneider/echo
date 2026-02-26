import { useEffect, useState } from "react";
import {
  checkAccessibilityPermission,
  requestAccessibilityPermission,
} from "tauri-plugin-macos-permissions-api";
import { cn } from "@/lib/utils";

// Define permission state type
type PermissionState = "request" | "verify" | "granted";

// Define button configuration type
interface ButtonConfig {
  className: string;
  text: string;
}

export const AccessibilityPermissions = () => {
  const [hasAccessibility, setHasAccessibility] = useState<boolean>(false);
  const [permissionState, setPermissionState] =
    useState<PermissionState>("request");

  // Check permissions without requesting
  const checkPermissions = async (): Promise<boolean> => {
    const hasPermissions = await checkAccessibilityPermission();
    setHasAccessibility(hasPermissions);
    setPermissionState(hasPermissions ? "granted" : "verify");
    return hasPermissions;
  };

  // Handle the unified button action based on current state
  const handleButtonClick = async (): Promise<void> => {
    if (permissionState === "request") {
      try {
        await requestAccessibilityPermission();
        // After system prompt, transition to verification state
        setPermissionState("verify");
      } catch (error) {
        console.error("Error requesting permissions:", error);
        setPermissionState("verify");
      }
    } else if (permissionState === "verify") {
      // State is "verify" - check if permission was granted
      await checkPermissions();
    }
  };

  // On app boot - check permissions
  useEffect(() => {
    const initialSetup = async (): Promise<void> => {
      const hasPermissions = await checkAccessibilityPermission();
      setHasAccessibility(hasPermissions);
      setPermissionState(hasPermissions ? "granted" : "request");
    };

    initialSetup();
  }, []);

  if (hasAccessibility) {
    return null;
  }

  // Configure button text and style based on state
  const buttonConfig: Record<PermissionState, ButtonConfig | null> = {
    request: {
      text: "Grant",
      className:
        "px-2 py-1 text-sm font-semibold bg-muted/10 border  border-border/80 hover:bg-brand/10 rounded cursor-pointer hover:border-brand",
    },
    verify: {
      text: "Verify",
      className:
        "bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-1 px-3 rounded text-sm flex items-center justify-center cursor-pointer",
    },
    granted: null,
  };

  const config = buttonConfig[permissionState];
  if (!config) {
    return null;
  }

  return (
    <div className="flex w-full flex-col items-center gap-4 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="">
          <p className="font-medium text-sm">
            Please grant accessibility permissions for Echo
          </p>
        </div>
        <button
          className={cn("min-h-10", config.className)}
          onClick={handleButtonClick}
          type="button"
        >
          {config.text}
        </button>
      </div>
    </div>
  );
};
