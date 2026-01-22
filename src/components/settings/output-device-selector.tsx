import { RotateCcw, Speaker } from "lucide-react";
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

interface OutputDeviceSelectorProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
  disabled?: boolean;
}

export const OutputDeviceSelector = ({
  descriptionMode = "tooltip",
  grouped = false,
  disabled = false,
}: OutputDeviceSelectorProps) => {
  const {
    getSetting,
    updateSetting,
    resetSetting,
    isUpdating,
    isLoading,
    outputDevices,
    refreshOutputDevices,
  } = useSettings();

  const selectedOutputDevice =
    getSetting("selected_output_device") === "default"
      ? "Default"
      : getSetting("selected_output_device") || "Default";

  const handleOutputDeviceSelect = async (deviceName: string) => {
    await updateSetting("selected_output_device", deviceName);
  };

  const handleReset = async () => {
    await resetSetting("selected_output_device");
  };

  return (
    <SettingContainer
      description="Select your preferred audio output device for feedback sounds"
      descriptionMode={descriptionMode}
      disabled={disabled}
      grouped={grouped}
      icon={<Speaker className="h-4 w-4" />}
      title="Output Device"
    >
      <div className="flex items-center space-x-1">
        <Select
          disabled={
            disabled ||
            isUpdating("selected_output_device") ||
            isLoading ||
            outputDevices.length === 0
          }
          onValueChange={handleOutputDeviceSelect}
          value={selectedOutputDevice}
        >
          <SelectTrigger className="flex-1">
            <SelectValue
              placeholder={
                isLoading || outputDevices.length === 0
                  ? "Loading..."
                  : "Select output device..."
              }
            />
          </SelectTrigger>
          <SelectContent>
            {outputDevices.map((device) => (
              <SelectItem key={device.name} value={device.name}>
                {device.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          disabled={
            disabled || isUpdating("selected_output_device") || isLoading
          }
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
