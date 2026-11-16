import { KeyboardIcon } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { type } from "@tauri-apps/plugin-os";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createShortcutEditSession } from "@/components/settings/shortcut-edit-session";
import { SettingRow } from "@/features/settings/setting-row";
import { ShortcutBindingRow } from "@/features/shortcuts/shortcut-binding-row";
import { orderedShortcutBindings } from "@/features/shortcuts/shortcut-rows";
import { getKeyName, normalizeKey, type OSType } from "@/lib/utils/keyboard";
import {
  useSetting,
  useSettingsActions,
  useSettingsStore,
} from "@/stores/settings-store";

interface WaylandShortcutInfo {
  has_printable_key: boolean;
  id: string;
  trigger: string;
}
export const EchoShortcut: React.FC = () => {
  const bindings = useSetting("bindings") ?? {};
  const isLoading = useSettingsStore((s) => s.isLoading);
  const isUpdatingMap = useSettingsStore((s) => s.isUpdating);
  const { updateBinding, resetBinding } = useSettingsActions();
  const [keyPressed, setKeyPressed] = useState<string[]>([]);
  const [recordedKeys, setRecordedKeys] = useState<string[]>([]);
  const [editingShortcutId, setEditingShortcutId] = useState<string | null>(
    null
  );
  const [editSession] = useState(() =>
    createShortcutEditSession({
      resume: (id) => invoke("resume_binding", { id }).catch(console.error),
      suspend: (id) => invoke("suspend_binding", { id }).catch(console.error),
    })
  );
  const [osType, setOsType] = useState<OSType>("unknown");
  const [isWayland, setIsWayland] = useState(false);
  const [waylandShortcuts, setWaylandShortcuts] = useState<
    WaylandShortcutInfo[]
  >([]);
  const shortcutRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  useEffect(() => {
    const checkWayland = async () => {
      try {
        const wayland = await invoke<boolean>("is_wayland_session");
        setIsWayland(wayland);
        if (wayland) {
          const shortcuts = await invoke<WaylandShortcutInfo[]>(
            "get_wayland_shortcuts"
          );
          setWaylandShortcuts(shortcuts);
        }
      } catch (error) {
        console.error("Failed to check Wayland session:", error);
      }
    };
    checkWayland();
  }, []);
  useEffect(() => {
    if (!isWayland) {
      return;
    }
    const unlisten = listen<WaylandShortcutInfo[]>(
      "wayland-shortcuts-ready",
      (event) => {
        setWaylandShortcuts(event.payload);
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [isWayland]);
  useEffect(() => {
    if (!isWayland) {
      return;
    }
    const unlisten = listen<WaylandShortcutInfo[]>(
      "wayland-shortcuts-changed",
      (event) => {
        setWaylandShortcuts(event.payload);
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [isWayland]);
  useEffect(() => {
    const detectOsType = () => {
      try {
        const detectedType = type();
        let normalizedType: OSType;
        switch (detectedType) {
          case "macos":
            normalizedType = "macos";
            break;
          case "windows":
            normalizedType = "windows";
            break;
          case "linux":
            normalizedType = "linux";
            break;
          default:
            normalizedType = "unknown";
        }
        setOsType(normalizedType);
      } catch (error) {
        console.error("Error detecting OS type:", error);
        setOsType("unknown");
      }
    };
    detectOsType();
  }, []);
  useEffect(() => {
    const abandonEdit = () => {
      setEditingShortcutId(null);
      editSession.abandon();
    };
    window.addEventListener("blur", abandonEdit);
    return () => {
      window.removeEventListener("blur", abandonEdit);
      editSession.abandon();
    };
  }, [editSession]);
  useEffect(() => {
    if (editingShortcutId === null) {
      return;
    }
    const stopRecording = (change?: () => Promise<void>) => {
      setEditingShortcutId(null);
      editSession.end(editingShortcutId, change);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) {
        return;
      }
      if (e.key === "Escape") {
        stopRecording();
        return;
      }
      e.preventDefault();
      const rawKey = getKeyName(e, osType);
      const key = normalizeKey(rawKey);
      if (!keyPressed.includes(key)) {
        setKeyPressed((prev) => [...prev, key]);
        if (!recordedKeys.includes(key)) {
          setRecordedKeys((prev) => [...prev, key]);
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      const rawKey = getKeyName(e, osType);
      const key = normalizeKey(rawKey);
      setKeyPressed((prev) => prev.filter((k) => k !== key));
      const updatedKeyPressed = keyPressed.filter((k) => k !== key);
      if (updatedKeyPressed.length !== 0 || recordedKeys.length === 0) {
        return;
      }
      if (!bindings[editingShortcutId]) {
        return;
      }
      const newShortcut = recordedKeys.join("+");
      stopRecording(() => updateBinding(editingShortcutId, newShortcut));
    };
    const handleClickOutside = (e: MouseEvent) => {
      const activeElement = shortcutRefs.current.get(editingShortcutId);
      if (
        activeElement &&
        e.target instanceof Node &&
        !activeElement.contains(e.target)
      ) {
        stopRecording();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("click", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("click", handleClickOutside);
    };
  }, [
    keyPressed,
    recordedKeys,
    editingShortcutId,
    bindings,
    updateBinding,
    osType,
    editSession,
  ]);
  const startRecording = async (id: string) => {
    if (await editSession.begin(id)) {
      setKeyPressed([]);
      setRecordedKeys([]);
      setEditingShortcutId(id);
    }
  };
  const resetShortcut = async (id: string) => {
    setEditingShortcutId(null);
    await editSession.abandon();
    await resetBinding(id);
  };
  const formatCurrentKeys = (): string => {
    if (recordedKeys.length === 0) {
      return "Press keys...";
    }
    return recordedKeys.join("+");
  };
  const setShortcutRef = (id: string, ref: HTMLDivElement | null) => {
    shortcutRefs.current.set(id, ref);
  };
  if (isLoading) {
    return (
      <SettingRow
        description="Start and stop recording."
        icon={<KeyboardIcon className="h-4 w-4" />}
        title="Shortcuts"
      >
        <div className="text-caption text-muted-foreground">
          Loading shortcuts…
        </div>
      </SettingRow>
    );
  }
  if (Object.keys(bindings).length === 0) {
    return (
      <SettingRow
        description="Start and stop recording."
        icon={<KeyboardIcon className="h-4 w-4" />}
        title="Shortcuts"
      >
        <div className="text-caption text-muted-foreground">
          No shortcuts configured
        </div>
      </SettingRow>
    );
  }
  const getWaylandShortcut = (id: string): WaylandShortcutInfo | undefined =>
    waylandShortcuts.find((s) => s.id === id);
  const getWaylandWarning = (id: string): boolean => {
    if (!isWayland) {
      return false;
    }
    const info = getWaylandShortcut(id);
    return info?.has_printable_key ?? false;
  };
  return orderedShortcutBindings(bindings).map((binding) => (
    <ShortcutBindingRow
      binding={binding}
      currentKeys={formatCurrentKeys()}
      isEditing={editingShortcutId === binding.id}
      isUpdating={Boolean(isUpdatingMap[`binding_${binding.id}`])}
      key={binding.id}
      onEdit={startRecording}
      onReset={resetShortcut}
      setRef={setShortcutRef}
      showWaylandWarning={isWayland && getWaylandWarning(binding.id)}
    />
  ));
};
