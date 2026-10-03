import { Button } from "@ctrl-ui/react/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ctrl-ui/react/ui/select";
import { Mic, RotateCcw } from "lucide-react";
import { SettingRow } from "@/features/settings/setting-row";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsActions,
  useSettingsStore,
} from "@/stores/settings-store";
export const MicrophoneSelector = () => {
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
    <SettingRow icon={<Mic className="h-4 w-4" />} title="Microphone">
      <div className="flex items-center gap-1">
        <Select
          disabled={isUpdatingMic || isLoading || audioDevices.length === 0}
          onValueChange={handleMicrophoneSelect}
          value={selectedMicrophone}
        >
          <SelectTrigger className="min-w-0 flex-1">
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
          aria-label="Reset microphone"
          disabled={isUpdatingMic || isLoading}
          iconOnly
          onClick={handleReset}
          size="md"
          variant="ghost"
        >
          <RotateCcw className="h-5 w-5" />
        </Button>
      </div>
    </SettingRow>
  );
};
