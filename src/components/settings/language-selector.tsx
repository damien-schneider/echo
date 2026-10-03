import { Button } from "@ctrl-ui/react/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@ctrl-ui/react/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ctrl-ui/react/ui/popover";
import { ChevronsUpDown, Globe, RotateCcw } from "lucide-react";
import { useId, useState } from "react";
import { SettingRow } from "@/features/settings/setting-row";
import {
  LANGUAGES,
  type TranscriptionLanguage,
} from "@/lib/constants/languages";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";
export const LanguageSelector = () => {
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
    <SettingRow
      description="Choose a language for better accuracy, or let Echo detect it."
      icon={<Globe className="h-4 w-4" />}
      title="Language"
    >
      <div className="flex items-center space-x-1">
        <Popover onOpenChange={setIsOpen} open={isOpen}>
          <PopoverTrigger
            render={
              <Button
                aria-expanded={isOpen}
                aria-label="Language"
                className="w-44 max-w-full justify-between"
                disabled={isLanguageUpdating}
                id={id}
                role="combobox"
                variant="surface"
              />
            }
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
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-0">
            <Command>
              <CommandInput placeholder="Search languages…" />
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
          aria-label="Reset language"
          disabled={isLanguageUpdating}
          iconOnly
          onClick={handleReset}
          size="md"
          variant="ghost"
        >
          <RotateCcw className="h-5 w-5" />
        </Button>
      </div>
    </SettingRow>
  );
};
