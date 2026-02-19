import { Mic, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { SettingContainer } from "@/components/ui/setting-container";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsActions,
  useSettingsStore,
} from "@/stores/settings-store";

interface MicrophoneSelectorProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const MicrophoneSelector = ({
  descriptionMode = "tooltip",
  grouped = false,
}: MicrophoneSelectorProps) => {
  const selectedMicrophoneRaw = useSetting("selected_microphone");
  const isUpdatingMic = useIsSettingUpdating("selected_microphone");
  const isLoading = useSettingsStore((s) => s.isLoading);
  const audioDevices = useSettingsStore((s) => s.audioDevices);
  const { updateSetting, resetSetting } = useSettingsActions();

  const selectedMicrophone =
    selectedMicrophoneRaw === "default"
      ? "Default"
      : selectedMicrophoneRaw || "Default";

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
          disabled={isUpdatingMic || isLoading || audioDevices.length === 0}
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
          disabled={isUpdatingMic || isLoading}
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
