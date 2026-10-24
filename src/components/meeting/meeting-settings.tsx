import { Button } from "@ctrl-ui/react/ui/button";
import { Switch } from "@ctrl-ui/react/ui/switch";
import { CubeIcon, MonitorIcon, SparkleIcon } from "@phosphor-icons/react";
import { MicrophoneSelector } from "@/components/settings/microphone-selector";
import {
  OPEN_MODELS_LABEL,
  openModelsPage,
} from "@/features/meeting/open-models-page";
import { polishModelName } from "@/features/polish/polish-model-state";
import { SettingRow } from "@/features/settings/setting-row";
import { SettingsSection } from "@/features/settings/settings-section";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

const RecordingSettings = () => {
  const systemAudioEnabled =
    useSetting("meeting_system_audio_enabled") ?? false;
  const updatingSystemAudio = useIsSettingUpdating(
    "meeting_system_audio_enabled"
  );
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  return (
    <SettingsSection title="Recording">
      <MicrophoneSelector />
      <SettingRow
        description="Capture system/output audio in addition to your microphone"
        icon={<MonitorIcon className="h-4 w-4" />}
        title="Capture system audio"
      >
        <Switch
          checked={systemAudioEnabled}
          disabled={updatingSystemAudio}
          onCheckedChange={(enabled) =>
            updateSetting("meeting_system_audio_enabled", enabled)
          }
        />
      </SettingRow>
    </SettingsSection>
  );
};

const SummarySettings = () => {
  const autoSummary = useSetting("meeting_auto_summary") ?? false;
  const updatingAutoSummary = useIsSettingUpdating("meeting_auto_summary");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  return (
    <SettingsSection title="Summary">
      <SettingRow
        description={`Summarize each meeting with ${polishModelName} on this computer when it ends`}
        icon={<SparkleIcon className="h-4 w-4" />}
        title="Auto-generate summary"
      >
        <Switch
          checked={autoSummary}
          disabled={updatingAutoSummary}
          onCheckedChange={(enabled) =>
            updateSetting("meeting_auto_summary", enabled)
          }
        />
      </SettingRow>
    </SettingsSection>
  );
};

const MeetingModelsLink = () => (
  <SettingsSection title="Models">
    <SettingRow
      description="Voxtral Realtime and speaker detection are downloaded and deleted in Models"
      icon={<CubeIcon className="h-4 w-4" />}
      title="Meeting models"
    >
      <Button onClick={openModelsPage} size="sm" variant="surface">
        {OPEN_MODELS_LABEL}
      </Button>
    </SettingRow>
  </SettingsSection>
);

export const MeetingSettings = () => (
  <>
    <RecordingSettings />
    <SummarySettings />
    <MeetingModelsLink />
  </>
);
