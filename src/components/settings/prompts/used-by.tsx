import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ctrl-ui/react/ui/select";
import type { PromptEntry } from "@/features/prompts/prompt-library-store";
import {
  choiceFromPromptRef,
  PROMPT_SURFACES,
  type PromptSurface,
  promptRefFromChoice,
  surfaceChoices,
} from "@/features/prompts/prompt-surfaces";
import { SettingRow } from "@/features/settings/setting-row";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

interface SurfacePromptSelectProps {
  entries: PromptEntry[];
  surface: PromptSurface;
}

const SurfacePromptSelect = ({
  entries,
  surface,
}: SurfacePromptSelectProps) => {
  const { description, setting, title } = PROMPT_SURFACES[surface];
  const current = useSetting(setting);
  const isUpdating = useIsSettingUpdating(setting);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const choices = surfaceChoices(surface, entries);
  return (
    <SettingRow description={description} title={title}>
      <Select
        disabled={isUpdating}
        items={choices}
        onValueChange={(choice) =>
          updateSetting(setting, promptRefFromChoice(choice))
        }
        value={choiceFromPromptRef(current)}
      >
        <SelectTrigger className="min-w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {choices.map((choice) => (
            <SelectItem key={choice.value} value={choice.value}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingRow>
  );
};

const SURFACES = Object.keys(PROMPT_SURFACES).filter(
  (key): key is PromptSurface => Object.hasOwn(PROMPT_SURFACES, key)
);

export const UsedBy = ({ entries }: { entries: PromptEntry[] }) =>
  SURFACES.map((surface) => (
    <SurfacePromptSelect entries={entries} key={surface} surface={surface} />
  ));
