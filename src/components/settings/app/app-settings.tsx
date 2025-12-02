import { CollapsibleSettingsGroup } from "@/components/ui/CollapsibleSettingsGroup";
import { useSettings } from "@/hooks/use-settings";
import { AudioFeedback } from "../audio-feedback";
import { AutostartToggle } from "../autostart-toggle";
import { ClipboardHandlingSetting } from "../clipboard-handling";
import { EchoShortcut } from "../echo-shortcut";
import { MicrophoneSelector } from "../microphone-selector";
import { OutputDeviceSelector } from "../output-device-selector";
import { PasteMethodSetting } from "../paste-method";
import { PushToTalk } from "../push-to-talk";
import { ShowOverlay } from "../show-overlay";
import { StartHidden } from "../start-hidden";
import { VolumeSlider } from "../volume-slider";
import { BetaFeaturesToggle } from "./beta-features-toggle";

export const AppSettings = () => {
  const { audioFeedbackEnabled } = useSettings();

  return (
    <div className="mx-auto w-full max-w-3xl pb-20">
      <CollapsibleSettingsGroup defaultOpen={true} title="Startup">
        <StartHidden descriptionMode="tooltip" grouped={true} />
        <AutostartToggle descriptionMode="tooltip" grouped={true} />
        <BetaFeaturesToggle descriptionMode="tooltip" grouped={true} />
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
