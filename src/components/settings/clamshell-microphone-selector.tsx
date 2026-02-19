import { invoke } from "@tauri-apps/api/core";
import { Laptop2, RefreshCw, RotateCcw } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { SettingContainer } from "@/components/ui/setting-container";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsActions,
  useSettingsStore,
} from "@/stores/settings-store";

interface ClamshellMicrophoneSelectorProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const ClamshellMicrophoneSelector: React.FC<
  ClamshellMicrophoneSelectorProps
> = ({ descriptionMode = "tooltip", grouped = false }) => {
  const clamshellMicRaw = useSetting("clamshell_microphone");
  const isUpdatingClamshell = useIsSettingUpdating("clamshell_microphone");
  const isLoading = useSettingsStore((s) => s.isLoading);
  const audioDevices = useSettingsStore((s) => s.audioDevices);
  const refreshAudioDevices = useSettingsStore((s) => s.refreshAudioDevices);
  const { updateSetting, resetSetting } = useSettingsActions();

  const [isLaptop, setIsLaptop] = useState<boolean>(false);

  useEffect(() => {
    const checkIsLaptop = async () => {
      try {
        const result = await invoke<boolean>("is_laptop");
        setIsLaptop(result);
      } catch (error) {
        console.error("Failed to check if device is laptop:", error);
        setIsLaptop(false);
      }
    };

    checkIsLaptop();
  }, []);

  // Only render on laptops
  if (!isLaptop) {
    return null;
  }

  const selectedClamshellMicrophone =
    clamshellMicRaw === "default" ? "Default" : clamshellMicRaw || "Default";

  const handleSelect = async (deviceName: string) => {
    await updateSetting("clamshell_microphone", deviceName);
  };

  const handleReset = async () => {
    await resetSetting("clamshell_microphone");
  };

  return (
    <SettingContainer
      description="Choose a fallback microphone to use when your laptop lid is closed"
      descriptionMode={descriptionMode}
      grouped={grouped}
      icon={<Laptop2 className="h-4 w-4" />}
      title="Clamshell Microphone"
    >
      <div className="flex items-center space-x-1">
        <Select
          disabled={
            isUpdatingClamshell || isLoading || audioDevices.length === 0
          }
          onValueChange={handleSelect}
          value={selectedClamshellMicrophone}
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
        <TooltipProvider>
          <ButtonGroup className="">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  disabled={isUpdatingClamshell || isLoading}
                  onClick={handleReset}
                  size="icon"
                  variant="outline"
                >
                  <RotateCcw className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset to default</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  disabled={isLoading}
                  onClick={refreshAudioDevices}
                  size="icon"
                  variant="outline"
                >
                  <RefreshCw className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh devices</TooltipContent>
            </Tooltip>
          </ButtonGroup>
        </TooltipProvider>
      </div>
    </SettingContainer>
  );
};

ClamshellMicrophoneSelector.displayName = "ClamshellMicrophoneSelector";
