import { ChevronsUpDown, Globe, RotateCcw } from "lucide-react";
import { useId, useState } from "react";
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
import {
  LANGUAGES,
  type TranscriptionLanguage,
} from "@/lib/constants/languages";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

interface LanguageSelectorProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const LanguageSelector = ({
  descriptionMode = "tooltip",
  grouped = false,
}: LanguageSelectorProps) => {
  const id = useId();
  const selectedLanguage = useSetting("selected_language") || "auto";
  const isLanguageUpdating = useIsSettingUpdating("selected_language");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const resetSetting = useSettingsStore((s) => s.resetSetting);
  const [isOpen, setIsOpen] = useState(false);

  const selectedLanguageData = LANGUAGES.find(
    (lang) => lang.value === selectedLanguage
  );
  const selectedLanguageName = selectedLanguageData?.label || "Auto";

  const handleLanguageSelect = async (language: TranscriptionLanguage) => {
    await updateSetting("selected_language", language);
    setIsOpen(false);
  };

  const handleReset = async () => {
    await resetSetting("selected_language");
  };

  return (
    <SettingContainer
      description="Select the language for speech recognition. Auto detects every supported language, while a specific language can improve accuracy."
      descriptionMode={descriptionMode}
      grouped={grouped}
      icon={<Globe className="h-4 w-4" />}
      title="Language"
    >
      <div className="flex items-center space-x-1">
        <Popover onOpenChange={setIsOpen} open={isOpen}>
          <PopoverTrigger asChild>
            <Button
              aria-expanded={isOpen}
              className="w-full min-w-[200px] justify-between"
              disabled={isLanguageUpdating}
              id={id}
              role="combobox"
              variant="secondary"
            >
              {selectedLanguage ? (
                <span className="flex min-w-0 items-center gap-2">
                  <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
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
                  {LANGUAGES.map((language) => (
                    <CommandItem
                      className="flex items-center justify-between"
                      key={language.value}
                      onSelect={() => handleLanguageSelect(language.value)}
                      value={language.value}
                    >
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                        {language.label}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Button
          disabled={isLanguageUpdating}
          onClick={handleReset}
          size="icon"
          variant="ghost"
        >
          <RotateCcw className="h-5 w-5" />
        </Button>
      </div>

      {isLanguageUpdating && (
        <div className="absolute inset-0 flex items-center justify-center rounded bg-muted/10">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        </div>
      )}
    </SettingContainer>
  );
};
