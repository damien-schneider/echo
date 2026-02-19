import { listen } from "@tauri-apps/api/event";
// biome-ignore lint/performance/noNamespaceImport: Dynamic flag component lookup by country code requires namespace import
import * as Flags from "country-flag-icons/react/3x2";
import { ChevronsUpDown, Globe, RotateCcw } from "lucide-react";
import React, { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SettingContainer } from "@/components/ui/setting-container";
import { useModels } from "@/hooks/use-models";
import { LANGUAGES } from "@/lib/constants/languages";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

interface LanguageSelectorProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

const unsupportedModels = ["parakeet-tdt-0.6b-v2", "parakeet-tdt-0.6b-v3"];

// Helper to get flag component for a country code
const getFlagComponent = (countryCode?: string) => {
  if (!countryCode) {
    return null;
  }
  const FlagComponent = (
    Flags as Record<string, React.ComponentType<{ className?: string }>>
  )[countryCode];
  return FlagComponent || null;
};

export const LanguageSelector = ({
  descriptionMode = "tooltip",
  grouped = false,
}: LanguageSelectorProps) => {
  const id = useId();
  const selectedLanguage = useSetting("selected_language") || "auto";
  const isLanguageUpdating = useIsSettingUpdating("selected_language");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const resetSetting = useSettingsStore((s) => s.resetSetting);
  const { currentModel, loadCurrentModel } = useModels();
  const [isOpen, setIsOpen] = useState(false);
  const isUnsupported = unsupportedModels.includes(currentModel);

  // Listen for model state changes to update UI reactively
  React.useEffect(() => {
    const modelStateUnlisten = listen("model-state-changed", () => {
      loadCurrentModel();
    });

    return () => {
      modelStateUnlisten.then((fn) => fn());
    };
  }, [loadCurrentModel]);

  const selectedLanguageData = LANGUAGES.find(
    (lang) => lang.value === selectedLanguage
  );
  const selectedLanguageName = isUnsupported
    ? "Auto"
    : selectedLanguageData?.label || "Auto";

  const handleLanguageSelect = async (currentValue: string) => {
    await updateSetting("selected_language", currentValue);
    setIsOpen(false);
  };

  const handleReset = async () => {
    await resetSetting("selected_language");
  };

  return (
    <SettingContainer
      description={
        isUnsupported
          ? "Parakeet model automatically detects the language. No manual selection is needed."
          : "Select the language for speech recognition. Auto will automatically determine the language, while selecting a specific language can improve accuracy for that language."
      }
      descriptionMode={descriptionMode}
      disabled={isUnsupported}
      grouped={grouped}
      icon={<Globe className="h-4 w-4" />}
      title="Language"
    >
      {isUnsupported ? (
        <p className="text-muted-foreground text-xs">
          The selected model automatically detects the language.
        </p>
      ) : (
        <div className="flex items-center space-x-1">
          <Popover onOpenChange={setIsOpen} open={isOpen}>
            <PopoverTrigger asChild>
              <Button
                aria-expanded={isOpen}
                className="w-full min-w-[200px] justify-between"
                disabled={isLanguageUpdating || isUnsupported}
                id={id}
                role="combobox"
                variant="secondary"
              >
                {selectedLanguage ? (
                  <span className="flex min-w-0 items-center gap-2">
                    {(() => {
                      const FlagComponent = getFlagComponent(
                        selectedLanguageData?.countryCode
                      );
                      return FlagComponent ? (
                        <FlagComponent className="h-3 w-4 shrink-0" />
                      ) : (
                        <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                      );
                    })()}
                    <span className="truncate">{selectedLanguageName}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">Select language</span>
                )}
                <ChevronsUpDown
                  aria-hidden="true"
                  className="shrink-0 text-muted-foreground/80"
                  size={16}
                />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-full min-w-(--radix-popper-anchor-width) border-input p-0"
            >
              <Command>
                <CommandInput placeholder="Search languages..." />
                <CommandList>
                  <CommandEmpty>No language found.</CommandEmpty>
                  <CommandGroup>
                    {LANGUAGES.map((language) => {
                      const FlagComponent = getFlagComponent(
                        language.countryCode
                      );
                      return (
                        <CommandItem
                          className="flex items-center justify-between"
                          key={language.value}
                          onSelect={handleLanguageSelect}
                          value={language.value}
                        >
                          <div className="flex items-center gap-2">
                            {FlagComponent ? (
                              <FlagComponent className="h-3 w-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            {language.label}
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <Button
            disabled={isLanguageUpdating || isUnsupported}
            onClick={handleReset}
            size="icon"
            variant="ghost"
          >
            <RotateCcw className="h-5 w-5" />
          </Button>
        </div>
      )}

      {isLanguageUpdating && (
        <div className="absolute inset-0 flex items-center justify-center rounded bg-muted/10">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        </div>
      )}
    </SettingContainer>
  );
};
