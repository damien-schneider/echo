import React, { useEffect, useMemo } from "react";
import { Languages } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { Switch } from "../ui/switch";
import { SettingContainer } from "../ui/SettingContainer";
import { useSettings } from "../../hooks/useSettings";
import { useModels } from "../../hooks/useModels";

interface TranslateToEnglishProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

const unsupportedTranslationModels = [
  "parakeet-tdt-0.6b-v2",
  "parakeet-tdt-0.6b-v3",
  "turbo",
];

export const TranslateToEnglish: React.FC<TranslateToEnglishProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { getSetting, updateSetting, isUpdating } = useSettings();
    const { currentModel, loadCurrentModel, models } = useModels();

    const translateToEnglish = getSetting("translate_to_english") || false;
    const isDisabledTranslation =
      unsupportedTranslationModels.includes(currentModel);

    const description = useMemo(() => {
      if (isDisabledTranslation) {
        const currentModelDisplayName = models.find(
          (model) => model.id === currentModel,
        )?.name;
        return `Translation is not supported by the ${currentModelDisplayName} model.`;
      }

      return "Automatically translate speech from other languages to English during transcription.";
    }, [models, currentModel, isDisabledTranslation]);

    // Listen for model state changes to update UI reactively
    useEffect(() => {
      const modelStateUnlisten = listen("model-state-changed", () => {
        loadCurrentModel();
      });

      return () => {
        modelStateUnlisten.then((fn) => fn());
      };
    }, [loadCurrentModel]);

    return (
      <SettingContainer
        title="Translate to English"
        description={description}
        descriptionMode={descriptionMode}
        grouped={grouped}
        disabled={isDisabledTranslation}
        icon={<Languages className="w-4 h-4" />}
      >
        <Switch
          checked={translateToEnglish}
          onCheckedChange={(enabled) => updateSetting("translate_to_english", enabled)}
          disabled={isUpdating("translate_to_english") || isDisabledTranslation}
        />
      </SettingContainer>
    );
  },
);
