import { CustomWords } from "@/components/settings/custom-words";
import { LanguageSelector } from "@/components/settings/language-selector";
import { ModelUnloadTimeoutSetting } from "@/components/settings/model-unload-timeout";
import { TranslateToEnglish } from "@/components/settings/translate-to-english";
import { CollapsibleSettingsGroup } from "@/components/ui/collapsible-settings-group";

export const TranscriptionSettings = () => (
  <div className="mx-auto w-full max-w-3xl pb-20">
    <CollapsibleSettingsGroup defaultOpen={true} title="Language">
      <LanguageSelector descriptionMode="tooltip" grouped={true} />
      <TranslateToEnglish descriptionMode="tooltip" grouped={true} />
    </CollapsibleSettingsGroup>

    <CollapsibleSettingsGroup defaultOpen={true} title="Accuracy">
      <CustomWords descriptionMode="tooltip" grouped={true} />
      <ModelUnloadTimeoutSetting descriptionMode="tooltip" grouped={true} />
    </CollapsibleSettingsGroup>
  </div>
);
