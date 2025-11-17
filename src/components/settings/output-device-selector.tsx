import React from "react";
import { NativeSelect, NativeSelectOption } from "../ui/native-select";
import { SettingContainer } from "../ui/SettingContainer";
import { Button } from "../ui/Button";
import { RotateCcw, Speaker } from "lucide-react";
import { useSettings } from "../../hooks/useSettings";

interface OutputDeviceSelectorProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
  disabled?: boolean;
}

export const OutputDeviceSelector: React.FC<OutputDeviceSelectorProps> =
  React.memo(
    ({ descriptionMode = "tooltip", grouped = false, disabled = false }) => {
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
          title="Output Device"
          description="Select your preferred audio output device for feedback sounds"
          descriptionMode={descriptionMode}
          grouped={grouped}
          disabled={disabled}
          icon={<Speaker className="w-4 h-4" />}
        >
          <div className="flex items-center space-x-1">
            <NativeSelect
              value={selectedOutputDevice}
              onChange={(e) => handleOutputDeviceSelect(e.target.value)}
              disabled={
                disabled ||
                isUpdating("selected_output_device") ||
                isLoading ||
                outputDevices.length === 0
              }
              className="flex-1"
            >
              <NativeSelectOption value="" disabled>
                {isLoading || outputDevices.length === 0
                  ? "Loading..."
                  : "Select output device..."}
              </NativeSelectOption>
              {outputDevices.map((device) => (
                <NativeSelectOption key={device.name} value={device.name}>
                  {device.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleReset}
              disabled={
                disabled || isUpdating("selected_output_device") || isLoading
              }
            >
              <RotateCcw className="w-5 h-5" />
            </Button>
          </div>
        </SettingContainer>
      );
    },
  );
