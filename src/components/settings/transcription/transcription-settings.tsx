import { CustomWords } from "@/components/settings/custom-words";
import { LanguageSelector } from "@/components/settings/language-selector";
import { TranslateToEnglish } from "@/components/settings/translate-to-english";
import { SettingsSection } from "@/features/settings/settings-section";
export const TranscriptionSettings = () => (
  <div className="mx-auto w-full max-w-3xl pb-20">
    <SettingsSection defaultOpen={true} title="Language">
      <LanguageSelector />
      <TranslateToEnglish />
    </SettingsSection>

    <SettingsSection defaultOpen={true} title="Accuracy">
      <CustomWords />
    </SettingsSection>
  </div>
);
