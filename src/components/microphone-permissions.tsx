import { invoke } from "@tauri-apps/api/core";
import { requestMicrophonePermission } from "tauri-plugin-macos-permissions-api";
import { z } from "zod";
import {
  type MacosPermission,
  PermissionGate,
} from "@/components/macos-permissions";

const MicStatusSchema = z.enum(["authorized", "denied", "not_determined"]);

const microphoneStatus = async () =>
  MicStatusSchema.parse(await invoke("get_microphone_permission_status"));

const microphonePermission: MacosPermission = {
  check: async () => (await microphoneStatus()) === "authorized",
  request: async () => {
    if ((await microphoneStatus()) === "denied") {
      await invoke("open_microphone_settings");
      return;
    }
    await requestMicrophonePermission();
  },
  copy: {
    check_error: {
      button: "Try again",
      description:
        "Echo could not confirm access. Check System Settings > Privacy & Security > Microphone, then retry.",
      title: "Couldn’t check Microphone access",
    },
    checking: {
      button: "Checking…",
      description: "Confirming access for the Echo build currently running.",
      title: "Checking Microphone access",
    },
    denied: {
      button: "Allow Microphone Access",
      description:
        "macOS shows its permission dialog, or opens System Settings directly when a request was already refused. In dev the permission belongs to the app that launched Echo.",
      title: "Microphone access is not active for this build",
    },
    request_error: {
      button: "Try again",
      description:
        "Open System Settings > Privacy & Security > Microphone and enable the app Echo runs as, then retry.",
      title: "Couldn’t request Microphone access",
    },
    requesting: {
      button: "Requesting…",
      description: "Asking macOS to authorize the app Echo currently runs as.",
      title: "Requesting Microphone access",
    },
    verifying: {
      button: "Check again",
      description:
        "Enable the app Echo runs as under System Settings > Privacy & Security > Microphone. Echo will detect the change automatically.",
      title: "Waiting for Microphone access",
    },
  },
  label: "Microphone",
};

export const MicrophonePermissions = () => (
  <PermissionGate permission={microphonePermission} />
);
