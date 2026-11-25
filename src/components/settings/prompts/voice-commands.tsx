import { Button } from "@ctrl-ui/react/ui/button";
import { Switch } from "@ctrl-ui/react/ui/switch";
import {
  AppWindowIcon,
  FileTextIcon,
  MusicNotesIcon,
  SpeakerHighIcon,
} from "@phosphor-icons/react";
import {
  OPEN_MODELS_LABEL,
  openModelsPage,
} from "@/features/meeting/open-models-page";
import { SettingRow } from "@/features/settings/setting-row";
import { SettingsSection } from "@/features/settings/settings-section";
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
  enabled,
  supported,
}: {
  enabled: boolean;
  supported: boolean;
}) => {
  const isUpdating = useIsSettingUpdating("voice_commands");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  return (
    <SettingRow
      description={
        supported
          ? "When no text field has focus, what you say runs as a command."
          : "Select Qwen3 4B in Models to use voice commands."
      }
      title="Voice commands"
    >
      {supported ? (
        <Switch
          checked={enabled}
          disabled={isUpdating}
          onCheckedChange={(value) => updateSetting("voice_commands", value)}
        />
      ) : (
        <Button onClick={openModelsPage} size="sm" variant="surface">
          {OPEN_MODELS_LABEL}
        </Button>
      )}
    </SettingRow>
  );
};

const SpeakRepliesToggle = ({
  commandsEnabled,
}: {
  commandsEnabled: boolean;
}) => {
  const speakReplies = useSetting("tts_enabled") ?? false;
  const isUpdating = useIsSettingUpdating("tts_enabled");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  return (
    <SettingRow
      description="Say what a command did out loud."
      disabled={!commandsEnabled}
      icon={<SpeakerHighIcon className="h-4 w-4" />}
      title="Speak replies"
    >
      <Switch
        checked={speakReplies}
        disabled={isUpdating || !commandsEnabled}
        onCheckedChange={(value) => updateSetting("tts_enabled", value)}
      />
    </SettingRow>
  );
};

const AvailableCommands = ({
  commandsEnabled,
}: {
  commandsEnabled: boolean;
}) => (
  <SettingRow disabled={!commandsEnabled} layout="stacked" title="Commands">
    <ul className="flex flex-col gap-1">
      {VOICE_COMMANDS.map(({ icon: Icon, name, example }) => (
        <li
          className="flex items-center gap-3 rounded-control bg-muted/40 px-3 py-2 text-label"
          key={name}
        >
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <span>{name}</span>
            <span className="ml-2 text-caption text-muted-foreground/60">
              e.g. {example}
            </span>
          </div>
        </li>
      ))}
    </ul>
  </SettingRow>
);

export const VoiceCommandsSettings = ({
  supported,
}: {
  supported: boolean;
}) => {
  const commandsEnabled = (useSetting("voice_commands") ?? true) && supported;
  return (
    <SettingsSection title="Voice commands">
      <VoiceCommandsToggle enabled={commandsEnabled} supported={supported} />
      <SpeakRepliesToggle commandsEnabled={commandsEnabled} />
      <AvailableCommands commandsEnabled={commandsEnabled} />
    </SettingsSection>
  );
};
