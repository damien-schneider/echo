import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { z } from "zod";
import { ModelRow } from "@/components/model-selector/model-row";
import { SettingsSection } from "@/features/settings/settings-section";

const LegacyFilesMbSchema = z.number().nonnegative().nullable();

const readLegacyFilesMb = async () =>
  LegacyFilesMbSchema.parse(await invoke<unknown>("get_legacy_model_files_mb"));

export const LegacyModelFilesSection = () => {
  const [sizeMb, setSizeMb] = useState<number | null>(null);

  useEffect(() => {
    let stopped = false;
    readLegacyFilesMb()
      .then((next) => {
        if (!stopped) {
          setSizeMb(next);
        }
      })
      .catch((reason) =>
        console.error("Failed to size old model files:", reason)
      );
    return () => {
      stopped = true;
    };
  }, []);

  if (sizeMb === null) {
    return null;
  }
  return (
    <SettingsSection title="Storage">
      <ModelRow
        description="Models that earlier versions of Echo downloaded. This version never uses them."
        diskMb={sizeMb}
        files={{
          disabled: false,
          onDelete: async () => {
            await invoke("delete_legacy_model_files");
            setSizeMb(await readLegacyFilesMb());
          },
          onReveal: () => invoke("reveal_legacy_model_files"),
        }}
        name="Files from older versions"
      />
    </SettingsSection>
  );
};
