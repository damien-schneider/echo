import {
  BookText,
  Download,
  PencilIcon,
  PlusIcon,
  Trash2,
  Upload,
} from "lucide-react";
import type React from "react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { SettingContainer } from "@/components/ui/setting-container";
import type { DictionaryEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

interface DictionaryEditorProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

const VARIANT_SPLIT_REGEX = /[\n,]+/;

const parseVariantsInput = (raw: string): string[] => {
  const seen = new Set<string>();
  return raw
    .split(VARIANT_SPLIT_REGEX)
    .map((v) => v.trim())
    .filter((v) => {
      if (!v || seen.has(v)) {
        return false;
      }
      seen.add(v);
      return true;
    });
};

const isValidImportShape = (value: unknown): value is DictionaryEntry[] => {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every(
    (entry): entry is DictionaryEntry =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as { canonical?: unknown }).canonical === "string" &&
      Array.isArray((entry as { variants?: unknown }).variants) &&
      (entry as { variants: unknown[] }).variants.every(
        (v) => typeof v === "string"
      )
  );
};

export const DictionaryEditor = ({
  descriptionMode = "tooltip",
  grouped = false,
}: DictionaryEditorProps) => {
  const dictionary = useSetting("cleanup_dictionary") || [];
  const updating = useIsSettingUpdating("cleanup_dictionary");
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  const [newCanonical, setNewCanonical] = useState("");
  const [newVariantsRaw, setNewVariantsRaw] = useState("");
  const [editingCanonical, setEditingCanonical] = useState<string | null>(null);
  const [editCanonicalDraft, setEditCanonicalDraft] = useState("");
  const [editVariantsDraft, setEditVariantsDraft] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const persist = (next: DictionaryEntry[]) => {
    updateSetting("cleanup_dictionary", next);
  };

  const handleAddEntry = () => {
    const canonical = newCanonical.trim();
    if (
      !canonical ||
      dictionary.some(
        (e) => e.canonical.toLowerCase() === canonical.toLowerCase()
      )
    ) {
      return;
    }
    const variants = parseVariantsInput(newVariantsRaw);
    persist([...dictionary, { canonical, variants }]);
    setNewCanonical("");
    setNewVariantsRaw("");
  };

  const handleRemoveEntry = (canonical: string) => {
    persist(dictionary.filter((e) => e.canonical !== canonical));
  };

  const handleStartEdit = (entry: DictionaryEntry) => {
    setEditingCanonical(entry.canonical);
    setEditCanonicalDraft(entry.canonical);
    setEditVariantsDraft(entry.variants.join(", "));
  };

  const handleCancelEdit = () => {
    setEditingCanonical(null);
    setEditCanonicalDraft("");
    setEditVariantsDraft("");
  };

  const handleSaveEdit = () => {
    if (editingCanonical === null) {
      return;
    }
    const trimmed = editCanonicalDraft.trim();
    if (!trimmed) {
      return;
    }
    const isDuplicate = dictionary.some(
      (e) =>
        e.canonical !== editingCanonical &&
        e.canonical.toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      return;
    }
    persist(
      dictionary.map((e) =>
        e.canonical === editingCanonical
          ? {
              canonical: trimmed,
              variants: parseVariantsInput(editVariantsDraft),
            }
          : e
      )
    );
    handleCancelEdit();
  };

  const handleAddKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddEntry();
    }
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(dictionary, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "echo-cleanup-dictionary.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      if (!isValidImportShape(parsed)) {
        console.error("Invalid dictionary JSON shape");
        return;
      }
      // Dedupe by canonical, case-insensitive, preserve order.
      const seen = new Set<string>();
      const merged: DictionaryEntry[] = [];
      for (const entry of parsed) {
        const key = entry.canonical.toLowerCase();
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        merged.push({
          canonical: entry.canonical,
          variants: entry.variants.filter((v) => v.trim() !== ""),
        });
      }
      persist(merged);
    } catch (error) {
      console.error("Failed to import dictionary:", error);
    }
  };

  const canAddEntry =
    newCanonical.trim().length > 0 &&
    !dictionary.some(
      (e) => e.canonical.toLowerCase() === newCanonical.trim().toLowerCase()
    );

  return (
    <>
      <SettingContainer
        description="Names and terms to preserve verbatim in cleaned transcripts. Add the canonical spelling and any variants (commonly misheard or misspelled forms) — variants are rewritten to the canonical before the cleanup model runs."
        descriptionMode={descriptionMode}
        grouped={grouped}
        icon={<BookText className="h-4 w-4" />}
        layout="stacked"
        title="Custom Dictionary"
      >
        <div className="flex flex-col gap-2">
          <ButtonGroup className="w-full">
            <Input
              className="min-w-0 flex-1"
              disabled={updating}
              onChange={(e) => setNewCanonical(e.target.value)}
              onKeyDown={handleAddKeyDown}
              placeholder="Canonical (e.g. Damien)"
              type="text"
              value={newCanonical}
              variant="button"
            />
            <Input
              className="min-w-0 flex-1"
              disabled={updating}
              onChange={(e) => setNewVariantsRaw(e.target.value)}
              onKeyDown={handleAddKeyDown}
              placeholder="Variants, comma-separated (optional)"
              type="text"
              value={newVariantsRaw}
              variant="button"
            />
            <Button
              aria-label="Add entry"
              disabled={!canAddEntry || updating}
              onClick={handleAddEntry}
              size="icon"
              variant="default"
            >
              <PlusIcon className="h-4 w-4" />
            </Button>
          </ButtonGroup>

          <div className="flex gap-2">
            <Button
              disabled={updating}
              onClick={handleImportClick}
              size="xs"
              variant="ghost"
            >
              <Upload className="mr-1 h-3 w-3" />
              Import JSON
            </Button>
            <Button
              disabled={dictionary.length === 0}
              onClick={handleExport}
              size="xs"
              variant="ghost"
            >
              <Download className="mr-1 h-3 w-3" />
              Export JSON
            </Button>
            <input
              accept="application/json"
              className="hidden"
              onChange={handleImportFile}
              ref={fileInputRef}
              type="file"
            />
          </div>
        </div>
      </SettingContainer>

      {dictionary.length > 0 && (
        <div
          className={cn(
            "flex flex-col gap-2 p-2 px-4",
            !grouped && "rounded-lg border border-border/20"
          )}
        >
          {dictionary.map((entry) => {
            const isEditing = editingCanonical === entry.canonical;
            if (isEditing) {
              return (
                <div
                  className="flex flex-col gap-2 rounded-md border border-border/20 bg-muted/5 p-2"
                  key={entry.canonical}
                >
                  <Input
                    disabled={updating}
                    onChange={(e) => setEditCanonicalDraft(e.target.value)}
                    placeholder="Canonical"
                    type="text"
                    value={editCanonicalDraft}
                  />
                  <Input
                    disabled={updating}
                    onChange={(e) => setEditVariantsDraft(e.target.value)}
                    placeholder="Variants, comma-separated"
                    type="text"
                    value={editVariantsDraft}
                  />
                  <div className="flex gap-2">
                    <Button
                      disabled={!editCanonicalDraft.trim() || updating}
                      onClick={handleSaveEdit}
                      size="xs"
                    >
                      Save
                    </Button>
                    <Button
                      onClick={handleCancelEdit}
                      size="xs"
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              );
            }
            return (
              <div
                className="flex flex-col gap-1 rounded-md border border-border/20 bg-muted/5 p-2"
                key={entry.canonical}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{entry.canonical}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      aria-label={`Edit ${entry.canonical}`}
                      disabled={updating}
                      onClick={() => handleStartEdit(entry)}
                      size="icon"
                      variant="ghost"
                    >
                      <PencilIcon className="h-3 w-3" />
                    </Button>
                    <Button
                      aria-label={`Remove ${entry.canonical}`}
                      disabled={updating}
                      onClick={() => handleRemoveEntry(entry.canonical)}
                      size="icon"
                      variant="ghost"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {entry.variants.length > 0 && (
                  <ButtonGroup className="w-full flex-wrap gap-1">
                    {entry.variants.map((variant) => (
                      <span
                        className="rounded-full bg-muted/30 px-2 py-0.5 text-muted-foreground text-xs"
                        key={variant}
                      >
                        {variant}
                      </span>
                    ))}
                  </ButtonGroup>
                )}
                {entry.variants.length === 0 && (
                  <span className="text-muted-foreground/60 text-xs">
                    No variants
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};
