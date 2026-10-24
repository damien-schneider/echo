import { Badge } from "@ctrl-ui/react/ui/badge";
import { Switch } from "@ctrl-ui/react/ui/switch";
import {
  AppWindowIcon,
  FileTextIcon,
  LightningIcon,
  LightningSlashIcon,
  MusicNotesIcon,
} from "@phosphor-icons/react";
import { SettingRow } from "@/features/settings/setting-row";
import { SettingsSection } from "@/features/settings/settings-section";
import { cn } from "@/lib/utils";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

const VOICE_COMMANDS = [
  {
    example: '"Open Safari"',
    icon: AppWindowIcon,
    name: "Open Application",
  },
  {
    example: '"Create a note called grocery list with milk and eggs"',
    icon: FileTextIcon,
    name: "Create Note",
  },
  {
    example: '"Change the sound theme"',
    icon: MusicNotesIcon,
    name: "Change Sound Theme",
  },
] as const;

const VoiceCommandsToggle = ({
  postProcessEnabled,
}: {
  postProcessEnabled: boolean;
}) => {
  const voiceCommandsEnabled = useSetting("voice_commands_enabled") ?? true;
  const isUpdating = useIsSettingUpdating("voice_commands_enabled");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  return (
    <SettingRow
      description={
        postProcessEnabled
          ? "Let AI open apps, create notes, and change settings by voice."
          : "Voice commands run with post-processing. Turn on Post-process transcriptions to use them."
      }
      disabled={!postProcessEnabled}
      title="Voice commands"
    >
      <Switch
        checked={voiceCommandsEnabled}
        disabled={isUpdating || !postProcessEnabled}
        onCheckedChange={(value) =>
          updateSetting("voice_commands_enabled", value)
        }
      />
    </SettingRow>
  );
};

const AvailableCommands = ({
  postProcessEnabled,
}: {
  postProcessEnabled: boolean;
}) => {
  const voiceCommandsEnabled = useSetting("voice_commands_enabled") ?? true;
  const isActive = postProcessEnabled && voiceCommandsEnabled;
  return (
    <SettingRow
      description="Available voice commands when the feature is enabled."
      layout="stacked"
      title="Available Commands"
    >
      <ul className="flex flex-col gap-1">
        {VOICE_COMMANDS.map(({ icon: Icon, name, example }) => (
          <li
            className="flex items-center gap-3 rounded-md bg-muted/40 px-3 py-2 text-label"
            key={name}
          >
            <Icon
              className={cn(
                "size-4 shrink-0",
                isActive
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-muted-foreground/50"
              )}
            />
            <div className="min-w-0 flex-1">
              <span
                className={
                  isActive ? "text-foreground" : "text-muted-foreground"
                }
              >
                {name}
              </span>
              <span className="ml-2 text-caption text-muted-foreground/60">
                e.g. {example}
              </span>
            </div>
            {isActive ? (
              <Badge className="gap-1" color="green" size="sm">
                <LightningIcon className="size-2.5" />
                Active
              </Badge>
            ) : (
              <Badge className="gap-1" size="sm">
                <LightningSlashIcon className="size-2.5" />
                Off
              </Badge>
            )}
          </li>
        ))}
      </ul>
    </SettingRow>
  );
};

export const VoiceCommandsSettings = () => {
  const postProcessEnabled = useSetting("post_process_enabled") ?? false;
  return (
    <SettingsSection title="Voice commands">
      <VoiceCommandsToggle postProcessEnabled={postProcessEnabled} />
      <AvailableCommands postProcessEnabled={postProcessEnabled} />
    </SettingsSection>
  );
};
