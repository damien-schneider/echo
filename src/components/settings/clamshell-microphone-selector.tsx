import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { NativeSelect, NativeSelectOption } from "../ui/native-select";
import { SettingContainer } from "../ui/SettingContainer";
import { Button } from "../ui/Button";
import { RotateCcw, RefreshCw, Laptop2 } from "lucide-react";
import { useSettings } from "../../hooks/useSettings";

interface ClamshellMicrophoneSelectorProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const ClamshellMicrophoneSelector: React.FC<ClamshellMicrophoneSelectorProps> = ({
  descriptionMode = "tooltip",
  grouped = false,
}) => {
  const {
    getSetting,
    updateSetting,
    resetSetting,
    isUpdating,
    isLoading,
    audioDevices,
    refreshAudioDevices,
  } = useSettings();

  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const checkBuiltinDisplay = async () => {
      try {
        const result = await invoke<boolean>("has_builtin_display");
        if (isMounted) {
          setShouldRender(result);
        }
      } catch (error) {
        console.error("Failed to check for built-in display:", error);
        if (isMounted) {
          setShouldRender(false);
        }
      }
    };

    checkBuiltinDisplay();

    return () => {
      isMounted = false;
    };
  }, []);

  if (!shouldRender) {
    return null;
  }

  const selectedClamshellMicrophone =
    getSetting("clamshell_microphone") === "default"
      ? "Default"
      : getSetting("clamshell_microphone") || "Default";

  const handleSelect = async (deviceName: string) => {
    await updateSetting("clamshell_microphone", deviceName);
  };

  const handleReset = async () => {
    await resetSetting("clamshell_microphone");
  };

  return (
    <SettingContainer
      title="Clamshell Microphone"
      description="Choose a fallback microphone to use when your laptop lid is closed"
      descriptionMode={descriptionMode}
      grouped={grouped}
      icon={<Laptop2 className="w-4 h-4" />}
    >
      <div className="flex items-center space-x-1">
        <NativeSelect
          value={selectedClamshellMicrophone}
          onChange={(event) => handleSelect(event.target.value)}
          disabled={
            isUpdating("clamshell_microphone") ||
            isLoading ||
            audioDevices.length === 0
          }
          className="flex-1"
        >
          <NativeSelectOption value="" disabled>
            {isLoading || audioDevices.length === 0
              ? "Loading..."
              : "Select microphone..."}
          </NativeSelectOption>
          {audioDevices.map((device) => (
            <NativeSelectOption key={device.name} value={device.name}>
              {device.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleReset}
          disabled={isUpdating("clamshell_microphone") || isLoading}
          title="Reset to default"
        >
          <RotateCcw className="w-5 h-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={refreshAudioDevices}
          disabled={isLoading}
          title="Refresh devices"
        >
          <RefreshCw className="w-5 h-5" />
        </Button>
      </div>
    </SettingContainer>
  );
};

ClamshellMicrophoneSelector.displayName = "ClamshellMicrophoneSelector";
