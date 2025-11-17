import React, { useState, useId } from "react";
import { listen } from "@tauri-apps/api/event";
import { SettingContainer } from "../ui/SettingContainer";
import { Button } from "../ui/Button";
import { RotateCcw, Globe, ChevronsUpDown } from "lucide-react";
import { useSettings } from "../../hooks/useSettings";
import { useModels } from "../../hooks/useModels";
import { LANGUAGES } from "../../lib/constants/languages";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import * as Flags from "country-flag-icons/react/3x2";

interface LanguageSelectorProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

const unsupportedModels = ["parakeet-tdt-0.6b-v2", "parakeet-tdt-0.6b-v3"];

// Helper to get flag component for a country code
const getFlagComponent = (countryCode?: string) => {
  if (!countryCode) return null;
  const FlagComponent = (Flags as any)[countryCode];
  return FlagComponent || null;
};

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  descriptionMode = "tooltip",
  grouped = false,
}) => {
  const id = useId();
  const { getSetting, updateSetting, resetSetting, isUpdating } = useSettings();
  const { currentModel, loadCurrentModel } = useModels();
  const [isOpen, setIsOpen] = useState(false);

  const selectedLanguage = getSetting("selected_language") || "auto";
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
      title="Language"
      description={
        isUnsupported
          ? "Parakeet model automatically detects the language. No manual selection is needed."
          : "Select the language for speech recognition. Auto will automatically determine the language, while selecting a specific language can improve accuracy for that language."
      }
      descriptionMode={descriptionMode}
      grouped={grouped}
      disabled={isUnsupported}
      icon={<Globe className="w-4 h-4" />}
    >
      <div className="flex items-center space-x-1">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              variant="outline"
              role="combobox"
              aria-expanded={isOpen}
              className="bg-background hover:bg-background border-input w-full min-w-[200px] justify-between px-3 font-normal outline-offset-0 focus-visible:outline-[3px]"
              disabled={isUpdating("selected_language") || isUnsupported}
            >
              {selectedLanguage ? (
                <span className="flex min-w-0 items-center gap-2">
                  {(() => {
                    const FlagComponent = getFlagComponent(
                      selectedLanguageData?.countryCode
                    );
                    return FlagComponent ? (
                      <FlagComponent className="w-4 h-3 shrink-0" />
                    ) : (
                      <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                    );
                  })()}
                  <span className="truncate">{selectedLanguageName}</span>
                </span>
              ) : (
                <span className="text-muted-foreground">Select language</span>
              )}
              <ChevronsUpDown
                size={16}
                className="text-muted-foreground/80 shrink-0"
                aria-hidden="true"
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="border-input w-full min-w-(--radix-popper-anchor-width) p-0"
            align="start"
          >
            <Command>
              <CommandInput placeholder="Search languages..." />
              <CommandList>
                <CommandEmpty>No language found.</CommandEmpty>
                <CommandGroup>
                  {LANGUAGES.map((language) => {
                    const FlagComponent = getFlagComponent(language.countryCode);
                    return (
                      <CommandItem
                        key={language.value}
                        value={language.value}
                        onSelect={handleLanguageSelect}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          {FlagComponent ? (
                            <FlagComponent className="w-4 h-3 text-muted-foreground shrink-0" />
                          ) : (
                            <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
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
          variant="ghost"
          size="icon"
          onClick={handleReset}
          disabled={isUpdating("selected_language") || isUnsupported}
        >
          <RotateCcw className="w-5 h-5" />
        </Button>
      </div>
      {isUpdating("selected_language") && (
        <div className="absolute inset-0 bg-muted/10 rounded flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </SettingContainer>
  );
};
