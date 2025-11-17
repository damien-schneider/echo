import React from "react";
import { ShowOverlay } from "../show-overlay";
import { TranslateToEnglish } from "../translate-to-english";
import { ModelUnloadTimeoutSetting } from "../model-unload-timeout";
import { CustomWords } from "../custom-words";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { StartHidden } from "../start-hidden";
import { AutostartToggle } from "../autostart-toggle";
import { PasteMethodSetting } from "../paste-method";
import { ClipboardHandlingSetting } from "../clipboard-handling";

export const AdvancedSettings: React.FC = () => {
  return (
    <div className="space-y-6">
      <SettingsGroup title="Advanced">
        <StartHidden descriptionMode="tooltip" grouped={true} />
        <AutostartToggle descriptionMode="tooltip" grouped={true} />
        <ShowOverlay descriptionMode="tooltip" grouped={true} />
        <PasteMethodSetting descriptionMode="tooltip" grouped={true} />
        <ClipboardHandlingSetting descriptionMode="tooltip" grouped={true} />
        <TranslateToEnglish descriptionMode="tooltip" grouped={true} />
        <ModelUnloadTimeoutSetting descriptionMode="tooltip" grouped={true} />
        <CustomWords descriptionMode="tooltip" grouped />
      </SettingsGroup>
    </div>
  );
};
