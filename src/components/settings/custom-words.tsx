import { Button } from "@ctrl-ui/react/ui/button";
import { ButtonGroup } from "@ctrl-ui/react/ui/button-group";
import { Input } from "@ctrl-ui/react/ui/input";
import { BookText, PlusIcon, XIcon } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { SettingRow } from "@/features/settings/setting-row";
import { cn } from "@/lib/utils";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";
export const CustomWords = () => {
  const customWords = useSetting("custom_words") || [];
  const updating = useIsSettingUpdating("custom_words");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const [newWord, setNewWord] = useState("");
  const handleAddWord = () => {
    const trimmedWord = newWord.trim();
    const sanitizedWord = trimmedWord.replace(/[<>"'&]/g, "");
    if (
      sanitizedWord &&
      !sanitizedWord.includes(" ") &&
      sanitizedWord.length <= 50 &&
      !customWords.includes(sanitizedWord)
    ) {
      updateSetting("custom_words", [...customWords, sanitizedWord]);
      setNewWord("");
    }
  };
  const handleRemoveWord = (wordToRemove: string) => {
    updateSetting(
      "custom_words",
      customWords.filter((word) => word !== wordToRemove)
    );
  };
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddWord();
    }
  };
  return (
    <>
      <SettingRow
        description="Add words that are often misheard or misspelled during transcription. The system will automatically correct similar-sounding words to match your list."
        icon={<BookText className="h-4 w-4" />}
        title="Custom Words"
      >
        <ButtonGroup className="w-full">
          <Input
            className="min-w-0"
            disabled={updating}
            onChange={(e) => setNewWord(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Add a word"
            type="text"
            value={newWord}
          />
          <Button
            disabled={
              !newWord.trim() ||
              newWord.includes(" ") ||
              newWord.trim().length > 50 ||
              updating
            }
            iconOnly
            onClick={handleAddWord}
            size="md"
            tone="primary"
            variant="solid"
          >
            <PlusIcon className="h-4 w-4" />
          </Button>
        </ButtonGroup>
      </SettingRow>
      {customWords.length > 0 && (
        <div className={cn("p-2 px-4", false)}>
          <ButtonGroup className="w-full flex-wrap gap-1">
            {customWords.map((word) => (
              <Button
                aria-label={`Remove ${word}`}
                className="gap-1 text-muted-foreground hover:text-foreground"
                disabled={updating}
                key={word}
                onClick={() => handleRemoveWord(word)}
                size="xs"
                variant="ghost"
              >
                <span>{word}</span>
                <XIcon className="h-3 w-3" />
              </Button>
            ))}
          </ButtonGroup>
        </div>
      )}
    </>
  );
};
