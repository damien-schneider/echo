import React from "react";
import { NativeSelect, NativeSelectOption } from "../ui/native-select";
import { SettingContainer } from "../ui/SettingContainer";
import { Button } from "../ui/Button";
import { RotateCcw, Mic } from "lucide-react";
import { useSettings } from "../../hooks/useSettings";

interface MicrophoneSelectorProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const MicrophoneSelector: React.FC<MicrophoneSelectorProps> = React.memo(({
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

  const selectedMicrophone = getSetting("selected_microphone") === "default" ? "Default" : getSetting("selected_microphone") || "Default";
  

  const handleMicrophoneSelect = async (deviceName: string) => {
    await updateSetting("selected_microphone", deviceName);
  };

  const handleReset = async () => {
    await resetSetting("selected_microphone");
  };

  return (
    <SettingContainer
      title="Microphone"
      description="Select your preferred microphone device"
      descriptionMode={descriptionMode}
      grouped={grouped}
      icon={<Mic className="w-4 h-4" />}
    >
      <div className="flex items-center space-x-1">
        <NativeSelect
          value={selectedMicrophone}
          onChange={(e) => handleMicrophoneSelect(e.target.value)}
          disabled={isUpdating("selected_microphone") || isLoading || audioDevices.length === 0}
          className="flex-1"
        >
          <NativeSelectOption value="" disabled>
            {isLoading || audioDevices.length === 0 ? "Loading..." : "Select microphone..."}
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
          disabled={isUpdating("selected_microphone") || isLoading}
        >
          <RotateCcw className="w-5 h-5" />
        </Button>
      </div>
    </SettingContainer>
  );
});
