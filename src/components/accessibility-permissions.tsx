import {
  checkAccessibilityPermission,
  requestAccessibilityPermission,
} from "tauri-plugin-macos-permissions-api";
import {
  type MacosPermission,
  PermissionGate,
} from "@/components/macos-permissions";

const accessibilityPermission: MacosPermission = {
  check: checkAccessibilityPermission,
  copy: {
    check_error: {
      button: "Try again",
      description:
        "Echo could not confirm access. Check that this exact build is enabled, then retry.",
      title: "Couldn’t check Accessibility access",
    },
    checking: {
      button: "Checking…",
      description: "Confirming access for the Echo build currently running.",
      title: "Checking Accessibility access",
    },
    denied: {
      button: "Request Accessibility Access",
      description:
        "Enable the exact Echo build currently running. If a development entry is already enabled, remove it and add the rebuilt executable again.",
      title: "Accessibility access is not active for this build",
    },
    request_error: {
      button: "Try again",
      description:
        "Open Privacy & Security > Accessibility and enable this exact Echo build, then retry.",
      title: "Couldn’t request Accessibility access",
    },
    requesting: {
      button: "Requesting…",
      description:
        "Asking macOS to authorize the Echo build currently running.",
      title: "Requesting Accessibility access",
    },
    verifying: {
      button: "Check again",
      description:
        "Enable this exact Echo build in Settings. If it is already enabled, toggle it off and on or add it again. Echo will detect the change automatically.",
      title: "Waiting for Accessibility access",
    },
  },
  label: "Accessibility",
  request: requestAccessibilityPermission,
};

export const AccessibilityPermissions = () => (
  <PermissionGate permission={accessibilityPermission} />
);
