import { Mic, RotateCcw } from "lucide-react";
import { useSettings } from "../../hooks/use-settings";
import { Button } from "../ui/Button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/Select";
import { SettingContainer } from "../ui/SettingContainer";

interface MicrophoneSelectorProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const MicrophoneSelector = ({
  descriptionMode = "tooltip",
  grouped = false,
}: MicrophoneSelectorProps) => {
  const {
    getSetting,
    updateSetting,
    resetSetting,
    isUpdating,
    isLoading,
    audioDevices,
    refreshAudioDevices,
  } = useSettings();

  const selectedMicrophone =
    getSetting("selected_microphone") === "default"
      ? "Default"
      : getSetting("selected_microphone") || "Default";

  const handleMicrophoneSelect = async (deviceName: string) => {
    await updateSetting("selected_microphone", deviceName);
  };

  const handleReset = async () => {
    await resetSetting("selected_microphone");
  };

  return (
    <SettingContainer
      description="Select your preferred microphone device"
      descriptionMode={descriptionMode}
      grouped={grouped}
      icon={<Mic className="h-4 w-4" />}
      title="Microphone"
    >
      <div className="flex items-center space-x-1">
        <Select
          disabled={
            isUpdating("selected_microphone") ||
            isLoading ||
            audioDevices.length === 0
          }
          onValueChange={handleMicrophoneSelect}
          value={selectedMicrophone}
        >
          <SelectTrigger className="flex-1">
            <SelectValue
              placeholder={
                isLoading || audioDevices.length === 0
                  ? "Loading..."
                  : "Select microphone..."
              }
            />
          </SelectTrigger>
          <SelectContent>
            {audioDevices.map((device) => (
              <SelectItem key={device.name} value={device.name}>
                {device.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          disabled={isUpdating("selected_microphone") || isLoading}
          onClick={handleReset}
          size="icon"
          variant="ghost"
        >
          <RotateCcw className="h-5 w-5" />
        </Button>
      </div>
    </SettingContainer>
  );
};
