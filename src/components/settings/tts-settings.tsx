import { invoke } from "@tauri-apps/api/core";
import { CheckCircle, Loader2, Play, Volume2, XCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useSetting, useSettingsStore } from "@/stores/settings-store";

const DEFAULT_PREVIEW_TEXT = "This is a preview of the text to speech voice.";

export function TtsSettings() {
  const ttsEnabled = useSetting("tts_enabled");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const [playing, setPlaying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState(DEFAULT_PREVIEW_TEXT);

  const isEnabled = ttsEnabled ?? false;

  const handlePreview = async () => {
    if (!previewText.trim()) {
      setErrorMessage("Please enter some text to preview");
      return;
    }

    setPlaying(true);
    setErrorMessage(null);
    try {
      await invoke("preview_tts", { text: previewText.trim() });
      setSuccessMessage("Preview playing...");
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (error) {
      console.error("Failed to preview voice:", error);
      setErrorMessage(`Preview failed: ${error}`);
    } finally {
      setPlaying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Enable/Disable TTS */}
      <div className="rounded-lg border border-border/40 bg-card px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="font-medium">Text-to-Speech</p>
            <p className="text-muted-foreground text-sm">
              Read aloud post-processed text using system voices.
            </p>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={(checked) => updateSetting("tts_enabled", checked)}
          />
        </div>
      </div>

      {isEnabled && (
        <div className="space-y-4">
          {/* System TTS Info */}
          <div className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/50 px-4 py-3">
            <Volume2 className="h-5 w-5 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-muted-foreground text-sm">
                System TTS automatically detects the language of your
                post-processed text and selects the best matching system voice.
                Works completely offline with no setup required.
              </p>
            </div>
          </div>

          {/* Preview Section */}
          <div className="rounded-lg border border-border/40 bg-card px-4 py-3">
            <div className="space-y-3">
              <p className="font-medium text-sm">Preview</p>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                onChange={(e) => setPreviewText(e.target.value)}
                placeholder="Enter text to preview the voice..."
                value={previewText}
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-green-600 dark:text-green-400">
                    ✓ System TTS ready
                  </span>
                </div>
                <Button
                  disabled={playing}
                  onClick={handlePreview}
                  size="sm"
                  variant="outline"
                >
                  {playing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Playing...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Preview
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Success Message */}
          {successMessage && (
            <div className="rounded-lg border border-green-500/20 bg-green-500/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                <p className="text-green-700 text-sm dark:text-green-300">
                  {successMessage}
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-destructive" />
                <p className="text-destructive text-sm">{errorMessage}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
