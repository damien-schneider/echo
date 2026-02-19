import { RotateCcw, Speaker } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingContainer } from "@/components/ui/setting-container";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsActions,
  useSettingsStore,
} from "@/stores/settings-store";

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
  const selectedOutputDeviceRaw = useSetting("selected_output_device");
  const isUpdatingDevice = useIsSettingUpdating("selected_output_device");
  const isLoading = useSettingsStore((s) => s.isLoading);
  const outputDevices = useSettingsStore((s) => s.outputDevices);
  const { updateSetting, resetSetting } = useSettingsActions();

  const selectedOutputDevice =
    selectedOutputDeviceRaw === "default"
      ? "Default"
      : selectedOutputDeviceRaw || "Default";

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
            isUpdatingDevice ||
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
          disabled={disabled || isUpdatingDevice || isLoading}
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
