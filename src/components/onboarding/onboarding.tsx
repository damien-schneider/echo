import { invoke } from "@tauri-apps/api/core";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import EchoLogo from "@/components/icons/echo-logo";
import type { ModelInfo } from "@/lib/types";
import ModelCard from "./model-card";

interface OnboardingProps {
  onModelSelected: () => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ onModelSelected }) => {
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadModels = useCallback(async () => {
    try {
      const models: ModelInfo[] = await invoke("get_available_models");
      // Only show downloadable models for onboarding
      setAvailableModels(models.filter((m) => !m.is_downloaded));
    } catch (err) {
      console.error("Failed to load models:", err);
      setError("Failed to load available models");
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const handleDownloadModel = async (modelId: string) => {
    setDownloading(true);
    setError(null);

    // Immediately transition to main app - download will continue in footer
    onModelSelected();

    try {
      await invoke("download_model", { modelId });
    } catch (err) {
      console.error("Download failed:", err);
      setError(`Failed to download model: ${err}`);
      setDownloading(false);
    }
  };

  const getRecommendedBadge = (modelId: string): boolean =>
    modelId === "parakeet-tdt-0.6b-v3";

  return (
    <div className="pt-8 pb-12">
      {/* Draggable header region */}
      <div className="h-8 w-full shrink-0 select-none" data-tauri-drag-region />
      <div
        className="mb-12 flex shrink-0 flex-col items-center gap-2 px-6"
        data-tauri-drag-region
      >
        <EchoLogo data-tauri-drag-region variant="full" width={120} />
        <p
          className="mx-auto mt-2 max-w-md font-light text-foreground/60"
          data-tauri-drag-region
        >
          To get started, choose a transcription model
        </p>
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-[600px] flex-1 flex-col px-6 text-center">
        {error && (
          <div className="mb-4 shrink-0 rounded-lg border border-red-500/20 bg-red-500/10 p-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/*<div className="flex flex-col gap-4 bg-background-dark p-4 py-5 w-full rounded-2xl flex-1 overflow-y-auto min-h-0">*/}
        <div className="flex flex-col gap-4">
          {availableModels
            .filter((model) => getRecommendedBadge(model.id))
            .map((model) => (
              <ModelCard
                disabled={downloading}
                key={model.id}
                model={model}
                onSelect={handleDownloadModel}
                variant="featured"
              />
            ))}

          {availableModels
            .filter((model) => !getRecommendedBadge(model.id))
            .sort((a, b) => a.size_mb - b.size_mb)
            .map((model) => (
              <ModelCard
                disabled={downloading}
                key={model.id}
                model={model}
                onSelect={handleDownloadModel}
              />
            ))}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
