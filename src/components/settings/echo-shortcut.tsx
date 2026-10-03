import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { type } from "@tauri-apps/plugin-os";
import { Keyboard } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SettingRow } from "@/features/settings/setting-row";
import { ShortcutBindingRow } from "@/features/shortcuts/shortcut-binding-row";
import { orderedShortcutBindings } from "@/features/shortcuts/shortcut-rows";
import {
  formatKeyCombination,
  getKeyName,
  normalizeKey,
  type OSType,
} from "@/lib/utils/keyboard";
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
  const [originalBinding, setOriginalBinding] = useState<string>("");
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
    if (editingShortcutId === null) {
      return;
    }
    let cleanup = false;
    const cancelRecording = async () => {
      if (editingShortcutId && originalBinding) {
        try {
          await updateBinding(editingShortcutId, originalBinding);
          await invoke("resume_binding", { id: editingShortcutId }).catch(
            console.error
          );
        } catch (error) {
          console.error("Failed to restore original binding:", error);
          toast.error("Failed to restore original shortcut");
        }
      } else if (editingShortcutId) {
        await invoke("resume_binding", { id: editingShortcutId }).catch(
          console.error
        );
      }
      setEditingShortcutId(null);
      setKeyPressed([]);
      setRecordedKeys([]);
      setOriginalBinding("");
    };
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (cleanup || e.repeat) {
        return;
      }
      if (e.key === "Escape") {
        await cancelRecording();
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
    const commitShortcut = async (bindingId: string, shortcut: string) => {
      try {
        await updateBinding(bindingId, shortcut);
        await invoke("resume_binding", { id: bindingId }).catch(console.error);
      } catch (error) {
        console.error("Failed to change binding:", error);
        toast.error(`Failed to set shortcut: ${error}`);
        if (originalBinding) {
          try {
            await updateBinding(bindingId, originalBinding);
            await invoke("resume_binding", { id: bindingId }).catch(
              console.error
            );
          } catch (resetError) {
            console.error("Failed to reset binding:", resetError);
            toast.error("Failed to reset shortcut to original value");
          }
        }
      }
    };
    const handleKeyUp = async (e: KeyboardEvent) => {
      if (cleanup) {
        return;
      }
      e.preventDefault();
      const rawKey = getKeyName(e, osType);
      const key = normalizeKey(rawKey);
      setKeyPressed((prev) => prev.filter((k) => k !== key));
      const updatedKeyPressed = keyPressed.filter((k) => k !== key);
      if (updatedKeyPressed.length !== 0 || recordedKeys.length === 0) {
        return;
      }
      if (!(editingShortcutId && bindings[editingShortcutId])) {
        return;
      }
      const newShortcut = recordedKeys.join("+");
      await commitShortcut(editingShortcutId, newShortcut);
      setEditingShortcutId(null);
      setKeyPressed([]);
      setRecordedKeys([]);
      setOriginalBinding("");
    };
    const handleClickOutside = async (e: MouseEvent) => {
      if (cleanup) {
        return;
      }
      const activeElement = shortcutRefs.current.get(editingShortcutId);
      if (
        activeElement &&
        e.target instanceof Node &&
        !activeElement.contains(e.target)
      ) {
        await cancelRecording();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("click", handleClickOutside);
    return () => {
      cleanup = true;
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("click", handleClickOutside);
    };
  }, [
    keyPressed,
    recordedKeys,
    editingShortcutId,
    bindings,
    originalBinding,
    updateBinding,
    osType,
  ]);
  const startRecording = async (id: string) => {
    if (editingShortcutId === id) {
      return;
    }
    await invoke("suspend_binding", { id }).catch(console.error);
    setOriginalBinding(bindings[id]?.current_binding || "");
    setEditingShortcutId(id);
    setKeyPressed([]);
    setRecordedKeys([]);
  };
  const formatCurrentKeys = (): string => {
    if (recordedKeys.length === 0) {
      return "Press keys...";
    }
    return formatKeyCombination(recordedKeys.join("+"), osType);
  };
  const setShortcutRef = (id: string, ref: HTMLDivElement | null) => {
    shortcutRefs.current.set(id, ref);
  };
  if (isLoading) {
    return (
      <SettingRow
        description="Start and stop recording."
        icon={<Keyboard className="h-4 w-4" />}
        title="Shortcuts"
      >
        <div className="text-muted-foreground text-sm">Loading shortcuts…</div>
      </SettingRow>
    );
  }
  if (Object.keys(bindings).length === 0) {
    return (
      <SettingRow
        description="Start and stop recording."
        icon={<Keyboard className="h-4 w-4" />}
        title="Shortcuts"
      >
        <div className="text-muted-foreground text-sm">
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
  return (
    <SettingRow
      icon={<Keyboard className="h-4 w-4" />}
      layout="stacked"
      title="Shortcuts"
    >
      <div className="w-full divide-y divide-border">
        {orderedShortcutBindings(bindings).map((binding) => (
          <ShortcutBindingRow
            binding={binding}
            currentKeys={formatCurrentKeys()}
            isEditing={editingShortcutId === binding.id}
            isUpdating={Boolean(isUpdatingMap[`binding_${binding.id}`])}
            key={binding.id}
            onEdit={startRecording}
            onReset={resetBinding}
            osType={osType}
            setRef={setShortcutRef}
            showWaylandWarning={isWayland && getWaylandWarning(binding.id)}
          />
        ))}
      </div>
    </SettingRow>
  );
};
