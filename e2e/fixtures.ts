import { test as base } from "@playwright/test";

const tauriInitScript = () => {
  const invokeDefaults: Record<string, unknown> = {
    has_any_models_available: true,
    get_microphone_mode: false,
    get_selected_microphone: "Default",
    get_clamshell_microphone: "Default",
    get_selected_output_device: "Default",
    get_available_microphones: [{ name: "Default", id: "default" }],
    get_available_output_devices: [{ name: "Default", id: "default" }],
    check_custom_sounds: { start: false, stop: false },
  };

  const respond = (cmd: string): unknown => {
    if (cmd in invokeDefaults) {
      return invokeDefaults[cmd];
    }
    if (cmd === "plugin:store|get_store") {
      return 1;
    }
    if (cmd === "plugin:store|get") {
      return [null, false];
    }
    if (cmd === "plugin:store|has") {
      return false;
    }
    if (cmd.startsWith("plugin:store|")) {
      return null;
    }
    if (cmd === "plugin:event|listen") {
      return 1;
    }
    if (cmd.startsWith("plugin:event|")) {
      return null;
    }
    if (cmd.startsWith("plugin:global-shortcut|")) {
      return null;
    }
    if (cmd.startsWith("plugin:webview|")) {
      return null;
    }
    if (cmd.startsWith("plugin:window|")) {
      return null;
    }
    return null;
  };

  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    value: {
      invoke: (cmd: string) => Promise.resolve(respond(cmd)),
      transformCallback: (cb: (payload: unknown) => void) => {
        const id = Math.floor(Math.random() * 1_000_000);
        (window as unknown as Record<string, unknown>)[`_${id}`] = cb;
        return id;
      },
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main" },
      },
    },
    writable: false,
  });

  Object.defineProperty(window, "__TAURI_OS_PLUGIN_INTERNALS__", {
    value: {
      eol: "\n",
      platform: "macos",
      version: "14.0.0",
      family: "unix",
      os_type: "macos",
      arch: "aarch64",
      exe_extension: "",
    },
    writable: false,
  });
};

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(tauriInitScript);
    await use(page);
  },
});
