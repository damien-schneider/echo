import { Wand2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import type { PolishLevel } from "@/lib/types";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

const LEVELS = ["correct", "natural", "clear"] as const;

const LABELS: Record<PolishLevel, string> = {
  clear: "Clearer",
  correct: "Corrections only",
  natural: "Natural",
};

const levelAt = (index: number): PolishLevel => LEVELS[index] ?? "natural";

export const PolishLevelSlider = () => {
  const level = useSetting("polish_level") ?? "natural";
  const updating = useIsSettingUpdating("polish_level");
  const updateSetting = useSettingsStore((state) => state.updateSetting);

  return (
    <Slider
      description="How far Polish may go: fix mistakes only, make the wording sound native, or also restructure what reads badly."
      disabled={updating}
      formatValue={(value) => LABELS[levelAt(value)]}
      icon={<Wand2 className="h-4 w-4" />}
      label="Polish level"
      max={LEVELS.length - 1}
      min={0}
      onChange={(value) =>
        updateSetting("polish_level", LEVELS[value] ?? "natural")
      }
      step={1}
      value={LEVELS.indexOf(level)}
    />
  );
};
