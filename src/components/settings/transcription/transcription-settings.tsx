import { CollapsibleSettingsGroup } from "@/components/ui/CollapsibleSettingsGroup";
import { useSettings } from "@/hooks/use-settings";
import { CustomWords } from "../custom-words";
import { LanguageSelector } from "../language-selector";
import { ModelUnloadTimeoutSetting } from "../model-unload-timeout";
import { PostProcessingSettingsPrompts } from "../post-processing/post-processing-settings";
import { TranslateToEnglish } from "../translate-to-english";

export const TranscriptionSettings = () => {
  const { getSetting } = useSettings();
  const betaEnabled = getSetting("beta_features_enabled") ?? false;

  return (
    <div className="mx-auto w-full max-w-3xl pb-20">
      <CollapsibleSettingsGroup defaultOpen={true} title="Language">
        <LanguageSelector descriptionMode="tooltip" grouped={true} />
        <TranslateToEnglish descriptionMode="tooltip" grouped={true} />
      </CollapsibleSettingsGroup>

      <CollapsibleSettingsGroup defaultOpen={true} title="Accuracy">
        <CustomWords descriptionMode="tooltip" grouped={true} />
        <ModelUnloadTimeoutSetting descriptionMode="tooltip" grouped={true} />
      </CollapsibleSettingsGroup>

      {betaEnabled && (
        <CollapsibleSettingsGroup
          defaultOpen={true}
          title="Post Processing Prompts"
        >
          <PostProcessingSettingsPrompts />
        </CollapsibleSettingsGroup>
      )}
    </div>
  );
};
