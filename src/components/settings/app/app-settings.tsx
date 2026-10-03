import { AudioFeedback } from "@/components/settings/audio-feedback";
import { AutostartToggle } from "@/components/settings/autostart-toggle";
import { ClipboardHandlingSetting } from "@/components/settings/clipboard-handling";
import { EchoShortcut } from "@/components/settings/echo-shortcut";
import { MicrophoneSelector } from "@/components/settings/microphone-selector";
import { OutputDeviceSelector } from "@/components/settings/output-device-selector";
import { PasteMethodSetting } from "@/components/settings/paste-method";
import { PushToTalk } from "@/components/settings/push-to-talk";
import { ShowOverlay } from "@/components/settings/show-overlay";
import { StartHidden } from "@/components/settings/start-hidden";
import { VolumeSlider } from "@/components/settings/volume-slider";
import { SettingsSection } from "@/features/settings/settings-section";
import { useSetting } from "@/stores/settings-store";
export const AppSettings = () => {
  const audioFeedbackEnabled = useSetting("audio_feedback") ?? false;
  return (
    <div className="space-y-5">
      <SettingsSection defaultOpen={true} title="Startup">
        <StartHidden />
        <AutostartToggle />
      </SettingsSection>

      <SettingsSection defaultOpen={true} title="Recording">
        <EchoShortcut />
        <PushToTalk />
        <MicrophoneSelector />
      </SettingsSection>

      <SettingsSection defaultOpen={true} title="Recording sounds">
        <AudioFeedback />
        <OutputDeviceSelector disabled={!audioFeedbackEnabled} />
        <VolumeSlider disabled={!audioFeedbackEnabled} />
      </SettingsSection>

      <SettingsSection defaultOpen={true} title="Output">
        <ShowOverlay />
        <PasteMethodSetting />
        <ClipboardHandlingSetting />
      </SettingsSection>
    </div>
  );
};
