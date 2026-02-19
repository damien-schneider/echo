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
import { CollapsibleSettingsGroup } from "@/components/ui/collapsible-settings-group";
import { useSetting } from "@/stores/settings-store";

export const AppSettings = () => {
  const audioFeedbackEnabled = useSetting("audio_feedback") ?? false;

  return (
    <div className="mx-auto w-full max-w-3xl pb-20">
      <CollapsibleSettingsGroup defaultOpen={true} title="Startup">
        <StartHidden descriptionMode="tooltip" grouped={true} />
        <AutostartToggle descriptionMode="tooltip" grouped={true} />
      </CollapsibleSettingsGroup>

      <CollapsibleSettingsGroup defaultOpen={true} title="Recording">
        <EchoShortcut descriptionMode="tooltip" grouped={true} />
        <PushToTalk descriptionMode="tooltip" grouped={true} />
        <MicrophoneSelector descriptionMode="tooltip" grouped={true} />
      </CollapsibleSettingsGroup>

      <CollapsibleSettingsGroup defaultOpen={true} title="Audio Feedback">
        <AudioFeedback descriptionMode="tooltip" grouped={true} />
        <OutputDeviceSelector
          descriptionMode="tooltip"
          disabled={!audioFeedbackEnabled}
          grouped={true}
        />
        <VolumeSlider disabled={!audioFeedbackEnabled} />
      </CollapsibleSettingsGroup>

      <CollapsibleSettingsGroup defaultOpen={true} title="Output">
        <ShowOverlay descriptionMode="tooltip" grouped={true} />
        <PasteMethodSetting descriptionMode="tooltip" grouped={true} />
        <ClipboardHandlingSetting descriptionMode="tooltip" grouped={true} />
      </CollapsibleSettingsGroup>
    </div>
  );
};
