import { Button } from "@ctrl-ui/react/ui/button";
import { ButtonGroup } from "@ctrl-ui/react/ui/button-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ctrl-ui/react/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@ctrl-ui/react/ui/tooltip";
import { invoke } from "@tauri-apps/api/core";
import { Laptop2, RefreshCw, RotateCcw } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { SettingRow } from "@/features/settings/setting-row";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsActions,
  useSettingsStore,
} from "@/stores/settings-store";
export const ClamshellMicrophoneSelector: React.FC = () => {
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
    <SettingRow
      description="Choose a fallback microphone to use when your laptop lid is closed"
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
              <TooltipTrigger
                render={
                  <Button
                    disabled={isUpdatingClamshell || isLoading}
                    iconOnly
                    onClick={handleReset}
                    size="md"
                    variant="surface"
                  />
                }
              >
                <RotateCcw className="h-5 w-5" />
              </TooltipTrigger>
              <TooltipContent>Reset to default</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    disabled={isLoading}
                    iconOnly
                    onClick={refreshAudioDevices}
                    size="md"
                    variant="surface"
                  />
                }
              >
                <RefreshCw className="h-5 w-5" />
              </TooltipTrigger>
              <TooltipContent>Refresh devices</TooltipContent>
            </Tooltip>
          </ButtonGroup>
        </TooltipProvider>
      </div>
    </SettingRow>
  );
};
ClamshellMicrophoneSelector.displayName = "ClamshellMicrophoneSelector";
