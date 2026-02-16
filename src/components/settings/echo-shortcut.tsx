import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { type } from "@tauri-apps/plugin-os";
import { AlertTriangle, Keyboard, RotateCcw } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSettings } from "../../hooks/use-settings";
import {
  formatKeyCombination,
  getKeyName,
  normalizeKey,
  type OSType,
} from "../../lib/utils/keyboard";
import { Button } from "../ui/Button";
import { SettingContainer } from "../ui/SettingContainer";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

/** Wayland shortcut info from the portal */
interface WaylandShortcutInfo {
  id: string;
  trigger: string;
  has_printable_key: boolean;
}

interface EchoShortcutProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const EchoShortcut: React.FC<EchoShortcutProps> = ({
  descriptionMode = "tooltip",
  grouped = false,
}) => {
  const { getSetting, updateBinding, resetBinding, isUpdating, isLoading } =
    useSettings();
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

  const bindings = getSetting("bindings") || {};

  // Detect if running on Wayland
  useEffect(() => {
    const checkWayland = async () => {
      try {
        const wayland = await invoke<boolean>("is_wayland_session");
        setIsWayland(wayland);
        if (wayland) {
          console.log("[EchoShortcut] Running on Wayland");
          // Fetch current Wayland shortcuts
          const shortcuts = await invoke<WaylandShortcutInfo[]>(
            "get_wayland_shortcuts"
          );
          console.log("[EchoShortcut] Wayland shortcuts:", shortcuts);
          setWaylandShortcuts(shortcuts);
        }
      } catch (error) {
        console.error("Failed to check Wayland session:", error);
      }
    };
    checkWayland();
  }, []);

  // Listen for Wayland shortcut updates (initial bind + rebind fallback)
  useEffect(() => {
    if (!isWayland) {
      return;
    }

    const unlisten = listen<WaylandShortcutInfo[]>(
      "wayland-shortcuts-ready",
      (event) => {
        console.log(
          "[EchoShortcut] Received wayland-shortcuts-ready:",
          event.payload
        );
        setWaylandShortcuts(event.payload);
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [isWayland]);

  // Listen for shortcut changes from the system configure dialog (portal v2)
  useEffect(() => {
    if (!isWayland) {
      return;
    }

    const unlisten = listen<WaylandShortcutInfo[]>(
      "wayland-shortcuts-changed",
      (event) => {
        console.log(
          "[EchoShortcut] Received wayland-shortcuts-changed:",
          event.payload
        );
        setWaylandShortcuts(event.payload);
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [isWayland]);

  // Detect and store OS type
  useEffect(() => {
    const detectOsType = async () => {
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
    // Only add event listeners when we're in editing mode
    if (editingShortcutId === null) {
      return;
    }

    let cleanup = false;

    // Keyboard event listeners
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (cleanup) {
        return;
      }
      if (e.repeat) {
        return; // ignore auto-repeat
      }
      if (e.key === "Escape") {
        // Cancel recording and restore original binding
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
        return;
      }
      e.preventDefault();

      // Get the key with OS-specific naming and normalize it
      const rawKey = getKeyName(e, osType);
      const key = normalizeKey(rawKey);

      if (!keyPressed.includes(key)) {
        setKeyPressed((prev) => [...prev, key]);
        // Also add to recorded keys if not already there
        if (!recordedKeys.includes(key)) {
          setRecordedKeys((prev) => [...prev, key]);
        }
      }
    };

    const handleKeyUp = async (e: KeyboardEvent) => {
      if (cleanup) {
        return;
      }
      e.preventDefault();

      // Get the key with OS-specific naming and normalize it
      const rawKey = getKeyName(e, osType);
      const key = normalizeKey(rawKey);

      // Remove from currently pressed keys
      setKeyPressed((prev) => prev.filter((k) => k !== key));

      // If no keys are pressed anymore, commit the shortcut
      const updatedKeyPressed = keyPressed.filter((k) => k !== key);
      if (updatedKeyPressed.length === 0 && recordedKeys.length > 0) {
        // Create the shortcut string from all recorded keys
        const newShortcut = recordedKeys.join("+");

        if (editingShortcutId && bindings[editingShortcutId]) {
          try {
            await updateBinding(editingShortcutId, newShortcut);
            // Re-register the shortcut now that recording is finished
            await invoke("resume_binding", { id: editingShortcutId }).catch(
              console.error
            );
          } catch (error) {
            console.error("Failed to change binding:", error);
            toast.error(`Failed to set shortcut: ${error}`);

            // Reset to original binding on error
            if (originalBinding) {
              try {
                await updateBinding(editingShortcutId, originalBinding);
                await invoke("resume_binding", { id: editingShortcutId }).catch(
                  console.error
                );
              } catch (resetError) {
                console.error("Failed to reset binding:", resetError);
                toast.error("Failed to reset shortcut to original value");
              }
            }
          }

          // Exit editing mode and reset states
          setEditingShortcutId(null);
          setKeyPressed([]);
          setRecordedKeys([]);
          setOriginalBinding("");
        }
      }
    };

    // Add click outside handler
    const handleClickOutside = async (e: MouseEvent) => {
      if (cleanup) {
        return;
      }
      const activeElement = shortcutRefs.current.get(editingShortcutId);
      if (activeElement && !activeElement.contains(e.target as Node)) {
        // Cancel shortcut recording and restore original binding
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
          invoke("resume_binding", { id: editingShortcutId }).catch(
            console.error
          );
        }
        setEditingShortcutId(null);
        setKeyPressed([]);
        setRecordedKeys([]);
        setOriginalBinding("");
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

  // Start recording a new shortcut
  const startRecording = async (id: string) => {
    if (editingShortcutId === id) {
      return; // Already editing this shortcut
    }

    // Suspend current binding to avoid firing while recording
    await invoke("suspend_binding", { id }).catch(console.error);

    // Store the original binding to restore if canceled
    setOriginalBinding(bindings[id]?.current_binding || "");
    setEditingShortcutId(id);
    setKeyPressed([]);
    setRecordedKeys([]);
  };

  // Format the current shortcut keys being recorded
  const formatCurrentKeys = (): string => {
    if (recordedKeys.length === 0) {
      return "Press keys...";
    }

    // Use the same formatting as the display to ensure consistency
    return formatKeyCombination(recordedKeys.join("+"), osType);
  };

  // Store references to shortcut elements
  const setShortcutRef = (id: string, ref: HTMLDivElement | null) => {
    shortcutRefs.current.set(id, ref);
  };

  // If still loading, show loading state
  if (isLoading) {
    return (
      <SettingContainer
        description="Configure keyboard shortcuts to trigger speech-to-text recording"
        descriptionMode={descriptionMode}
        grouped={grouped}
        icon={<Keyboard className="h-4 w-4" />}
        title="Echo Shortcuts"
      >
        <div className="text-muted-foreground text-sm">
          Loading shortcuts...
        </div>
      </SettingContainer>
    );
  }

  // If no bindings are loaded, show empty state
  if (Object.keys(bindings).length === 0) {
    return (
      <SettingContainer
        description="Configure keyboard shortcuts to trigger speech-to-text recording"
        descriptionMode={descriptionMode}
        grouped={grouped}
        icon={<Keyboard className="h-4 w-4" />}
        title="Echo Shortcuts"
      >
        <div className="text-muted-foreground text-sm">
          No shortcuts configured
        </div>
      </SettingContainer>
    );
  }

  // Get the Wayland shortcut info for a binding ID
  const getWaylandShortcut = (id: string): WaylandShortcutInfo | undefined => {
    return waylandShortcuts.find((s) => s.id === id);
  };

  // Get the Wayland printable key warning for a binding
  const getWaylandWarning = (id: string): boolean => {
    if (!isWayland) {
      return false;
    }
    const info = getWaylandShortcut(id);
    return info?.has_printable_key ?? false;
  };

  return (
    <SettingContainer
      description="Set the keyboard shortcut to start and stop speech-to-text recording"
      descriptionMode={descriptionMode}
      grouped={grouped}
      icon={<Keyboard className="h-4 w-4" />}
      title="Echo Shortcut"
      tooltipPosition="bottom"
    >
      {(() => {
        const primaryBinding = Object.values(bindings)[0];
        const primaryId = Object.keys(bindings)[0];

        if (!primaryBinding) {
          return (
            <div className="text-muted-foreground text-sm">
              No shortcuts configured
            </div>
          );
        }

        return (
          <div className="flex items-center space-x-1">
            {editingShortcutId === primaryId ? (
              <Button asChild size="sm" variant="secondary">
                <div ref={(ref) => setShortcutRef(primaryId, ref)}>
                  {formatCurrentKeys()}
                </div>
              </Button>
            ) : (
              <Button
                className="font-semibold"
                onClick={() => startRecording(primaryId)}
                size="sm"
                variant="secondary"
              >
                {formatKeyCombination(primaryBinding.current_binding, osType)}
              </Button>
            )}
            <Button
              disabled={isUpdating(`binding_${primaryId}`)}
              onClick={() => resetBinding(primaryId)}
              size="icon"
              variant="ghost"
            >
              <RotateCcw className="h-5 w-5" />
            </Button>
            {isWayland && getWaylandWarning(primaryId) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs" side="bottom">
                  <p className="text-xs">
                    This shortcut may type a character when activated on
                    Wayland. Consider using a shortcut without printable keys
                    (e.g., Super+Shift+F1).
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        );
      })()}
    </SettingContainer>
  );
};
