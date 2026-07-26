import { Sparkles } from "lucide-react";
import { DictionaryEditor } from "@/components/settings/cleanup/dictionary-editor";
import { CollapsibleSettingsGroup } from "@/components/ui/collapsible-settings-group";
import { SettingContainer } from "@/components/ui/setting-container";
import { Switch } from "@/components/ui/switch";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

const CleanupEnabledToggle = () => {
  const enabled = useSetting("cleanup_enabled") ?? false;
  const updating = useIsSettingUpdating("cleanup_enabled");
  const updateSetting = useSettingsStore((state) => state.updateSetting);

  return (
    <SettingContainer
      description="Apply local hallucination filtering and your dictionary without downloading another model."
      descriptionMode="tooltip"
      grouped={true}
      icon={<Sparkles className="h-4 w-4" />}
      title="Enable Lightweight Cleanup"
    >
      <Switch
        checked={enabled}
        disabled={updating}
        onCheckedChange={(value) => updateSetting("cleanup_enabled", value)}
      />
    </SettingContainer>
  );
};

export const CleanupSettings = () => (
  <div className="mx-auto w-full max-w-3xl pb-20">
    <CollapsibleSettingsGroup defaultOpen={true} title="Local Cleanup">
      <CleanupEnabledToggle />
    </CollapsibleSettingsGroup>

    <CollapsibleSettingsGroup defaultOpen={true} title="Dictionary">
      <DictionaryEditor descriptionMode="tooltip" grouped={true} />
    </CollapsibleSettingsGroup>
  </div>
);
