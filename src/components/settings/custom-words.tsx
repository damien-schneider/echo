import React, { useState } from "react";
import { BookText, PlusIcon, XIcon } from "lucide-react";
import { useSettings } from "../../hooks/useSettings";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { ButtonGroup } from "../ui/button-group";
import { SettingContainer } from "../ui/SettingContainer";

interface CustomWordsProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const CustomWords = ({ descriptionMode = "tooltip", grouped = false }: CustomWordsProps) => {
    const { getSetting, updateSetting, isUpdating } = useSettings();
    const [newWord, setNewWord] = useState("");
    const customWords = getSetting("custom_words") || [];

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
        customWords.filter((word) => word !== wordToRemove),
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
          title="Custom Words"
          description="Add words that are often misheard or misspelled during transcription. The system will automatically correct similar-sounding words to match your list."
          descriptionMode={descriptionMode}
          grouped={grouped}
          icon={<BookText className="w-4 h-4" />}
        >
          <ButtonGroup className="w-full">
            <Input
              type="text"
              variant="button"
              className="min-w-0"
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Add a word"
              disabled={isUpdating("custom_words")}
            />
            <Button
              onClick={handleAddWord}
              disabled={
                !newWord.trim() ||
                newWord.includes(" ") ||
                newWord.trim().length > 50 ||
                isUpdating("custom_words")
              }
              variant="default"
              size="icon"
            >
              <PlusIcon className="w-4 h-4" />
            </Button>
          </ButtonGroup>
        </SettingContainer>
        {customWords.length > 0 && (
          <div className={`px-4 p-2 ${grouped ? "" : "rounded-lg border border-border/20"}`}>
            <ButtonGroup className="w-full flex-wrap gap-1">
              {customWords.map((word) => (
                <Button
                  key={word}
                  onClick={() => handleRemoveWord(word)}
                  disabled={isUpdating("custom_words")}
                  variant="ghost"
                  size="xs"
                  className="gap-1 text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${word}`}
                >
                  <span>{word}</span>
                  <XIcon className="w-3 h-3" />
                </Button>
              ))}
            </ButtonGroup>
          </div>
        )}
      </>
    );
  };
