import { BookText, PlusIcon, XIcon } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/Input";
import { SettingContainer } from "@/components/ui/setting-container";
import { cn } from "@/lib/utils";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

interface CustomWordsProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const CustomWords = ({
  descriptionMode = "tooltip",
  grouped = false,
}: CustomWordsProps) => {
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
      <SettingContainer
        description="Add words that are often misheard or misspelled during transcription. The system will automatically correct similar-sounding words to match your list."
        descriptionMode={descriptionMode}
        grouped={grouped}
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
            variant="button"
          />
          <Button
            disabled={
              !newWord.trim() ||
              newWord.includes(" ") ||
              newWord.trim().length > 50 ||
              updating
            }
            onClick={handleAddWord}
            size="icon"
            variant="default"
          >
            <PlusIcon className="h-4 w-4" />
          </Button>
        </ButtonGroup>
      </SettingContainer>
      {customWords.length > 0 && (
        <div
          className={cn(
            "p-2 px-4",
            !grouped && "rounded-lg border border-border/20"
          )}
        >
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
