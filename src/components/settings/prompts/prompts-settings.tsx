import { Button } from "@ctrl-ui/react/ui/button";
import { Text } from "@ctrl-ui/react/ui/typography";
import { CubeIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import { PromptList } from "@/components/settings/prompts/prompt-list";
import { UsedBy } from "@/components/settings/prompts/used-by";
import { VoiceCommandsSettings } from "@/components/settings/prompts/voice-commands";
import {
  OPEN_MODELS_LABEL,
  openModelsPage,
} from "@/features/meeting/open-models-page";
import { polishModelName } from "@/features/polish/polish-model-state";
import { usePolishModel } from "@/features/polish/use-polish-model";
import { usePromptLibraryStore } from "@/features/prompts/prompt-library-store";
import { SettingRow } from "@/features/settings/setting-row";
import { SettingsSection } from "@/features/settings/settings-section";
import { getNormalizedOsPlatform } from "@/lib/os";
import { useSettingsStore } from "@/stores/settings-store";

// Linux has no focus probe, so Echo never learns that no text field has focus.
const voiceCommandsAreAvailable = getNormalizedOsPlatform() !== "linux";

const MODEL_SETUP_TITLES = {
  not_downloaded: `Download ${polishModelName}`,
  repair: `Repair ${polishModelName}`,
} as const;

const LocalModelSetup = () => {
  const { status } = usePolishModel();
  if (status.state !== "not_downloaded" && status.state !== "repair") {
    return null;
  }
  return (
    <SettingsSection title="Model">
      <SettingRow
        description="Prompts and voice commands run on it."
        icon={<CubeIcon className="h-4 w-4" />}
        title={MODEL_SETUP_TITLES[status.state]}
      >
        <Button onClick={openModelsPage} size="sm" variant="surface">
          {OPEN_MODELS_LABEL}
        </Button>
      </SettingRow>
    </SettingsSection>
  );
};

const PromptLibrary = () => {
  const library = usePromptLibraryStore((s) => s.library);
  const load = usePromptLibraryStore((s) => s.load);
  const refreshSettings = useSettingsStore((s) => s.refreshSettings);

  // The island changes its chat prompt behind this window's back.
  useEffect(() => {
    load();
    refreshSettings();
  }, [load, refreshSettings]);

  if (library.status === "loading") {
    return (
      <Text size="caption" tone="muted">
        Loading prompts…
      </Text>
    );
  }
  if (library.status === "error") {
    return (
      <Text role="alert" size="caption" tone="danger">
        Couldn't load prompts: {library.message}
      </Text>
    );
  }
  return (
    <>
      <SettingsSection title="Prompts">
        <PromptList entries={library.entries} />
      </SettingsSection>
      <SettingsSection title="Used by">
        <UsedBy entries={library.entries} />
      </SettingsSection>
    </>
  );
};

export const PromptsSettings = () => (
  <div className="space-y-5">
    <LocalModelSetup />
    <PromptLibrary />
    {voiceCommandsAreAvailable && <VoiceCommandsSettings />}
  </div>
);
