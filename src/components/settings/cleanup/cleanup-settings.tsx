import { invoke } from "@tauri-apps/api/core";
import { AppWindow, Cpu, Loader2, Sparkles, Wand2 } from "lucide-react";
import { useState } from "react";
import { DictionaryEditor } from "@/components/settings/cleanup/dictionary-editor";
import { Button } from "@/components/ui/button";
import { CollapsibleSettingsGroup } from "@/components/ui/collapsible-settings-group";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingContainer } from "@/components/ui/setting-container";
import { Switch } from "@/components/ui/switch";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

const AVAILABLE_CLEANUP_MODELS = [
  {
    id: "qwen2.5-1.5b-instruct-q4_k_m",
    label: "Qwen 2.5 1.5B Instruct (Q4_K_M)",
  },
] as const;

const CleanupEnabledToggle = () => {
  const enabled = useSetting("cleanup_enabled") ?? false;
  const updating = useIsSettingUpdating("cleanup_enabled");
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  return (
    <SettingContainer
      description="Run a small on-device LLM over each transcript to fix punctuation, capitalization, and known names from your dictionary. Privacy-preserving — no network calls."
      descriptionMode="tooltip"
      grouped={true}
      icon={<Sparkles className="h-4 w-4" />}
      title="Enable On-Device Cleanup"
    >
      <Switch
        checked={enabled}
        disabled={updating}
        onCheckedChange={(value) => updateSetting("cleanup_enabled", value)}
      />
    </SettingContainer>
  );
};

const CleanupModelSelector = () => {
  const cleanupEnabled = useSetting("cleanup_enabled") ?? false;
  const modelId =
    useSetting("cleanup_model_id") ?? AVAILABLE_CLEANUP_MODELS[0].id;
  const updating = useIsSettingUpdating("cleanup_model_id");
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  return (
    <SettingContainer
      description="The GGUF model used for the cleanup pass. Switching takes effect the next time the model is loaded."
      descriptionMode="tooltip"
      disabled={!cleanupEnabled}
      grouped={true}
      icon={<Cpu className="h-4 w-4" />}
      title="Cleanup Model"
    >
      <Select
        disabled={!cleanupEnabled || updating}
        onValueChange={(value) => updateSetting("cleanup_model_id", value)}
        value={modelId}
      >
        <SelectTrigger className="min-w-[260px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {AVAILABLE_CLEANUP_MODELS.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              {model.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingContainer>
  );
};

const CleanupAppContextToggle = () => {
  const cleanupEnabled = useSetting("cleanup_enabled") ?? false;
  const appContextEnabled = useSetting("cleanup_app_context_enabled") ?? false;
  const updating = useIsSettingUpdating("cleanup_app_context_enabled");
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  return (
    <SettingContainer
      description="When enabled, the cleanup prompt may include the name of the focused application to tune register (formal/casual/code). Phase 3 — coming soon, not yet active."
      descriptionMode="tooltip"
      disabled={!cleanupEnabled}
      grouped={true}
      icon={<AppWindow className="h-4 w-4" />}
      title="App Context Awareness (Phase 3 — coming)"
    >
      <Switch
        checked={appContextEnabled}
        disabled={!cleanupEnabled || updating}
        onCheckedChange={(value) =>
          updateSetting("cleanup_app_context_enabled", value)
        }
      />
    </SettingContainer>
  );
};

const CleanupTryIt = () => {
  const cleanupEnabled = useSetting("cleanup_enabled") ?? false;
  const [input, setInput] = useState("um so like, i met damian yesterday");
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const handleRun = async () => {
    setError(null);
    setOutput(null);
    setIsRunning(true);
    try {
      // Lazy-load the model on first try if needed.
      await invoke("cleanup_init");
      const cleaned = await invoke<string>("cleanup_test", { raw: input });
      setOutput(cleaned);
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <SettingContainer
      description="Run the cleanup pass on a short test phrase using your current settings (dictionary, register, language). Loads the model on first run."
      descriptionMode="tooltip"
      disabled={!cleanupEnabled}
      grouped={true}
      icon={<Wand2 className="h-4 w-4" />}
      layout="stacked"
      title="Try It"
    >
      <div className="flex flex-col gap-2">
        <Input
          disabled={!cleanupEnabled || isRunning}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a phrase to clean up..."
          type="text"
          value={input}
        />
        <div className="flex items-center gap-2">
          <Button
            disabled={!cleanupEnabled || isRunning || input.trim() === ""}
            onClick={handleRun}
            size="sm"
          >
            {isRunning ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                Running…
              </>
            ) : (
              "Run cleanup"
            )}
          </Button>
        </div>
        {output !== null && (
          <div className="rounded-md border border-border/20 bg-muted/5 p-2 text-sm">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Cleaned
            </p>
            <p className="mt-1 whitespace-pre-wrap">{output}</p>
          </div>
        )}
        {error !== null && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-destructive text-sm">
            {error}
          </div>
        )}
      </div>
    </SettingContainer>
  );
};

export const CleanupSettings = () => (
  <div className="mx-auto w-full max-w-3xl pb-20">
    <CollapsibleSettingsGroup defaultOpen={true} title="On-Device Cleanup">
      <CleanupEnabledToggle />
      <CleanupModelSelector />
      <CleanupTryIt />
    </CollapsibleSettingsGroup>

    <CollapsibleSettingsGroup defaultOpen={true} title="Dictionary">
      <DictionaryEditor descriptionMode="tooltip" grouped={true} />
    </CollapsibleSettingsGroup>

    <CollapsibleSettingsGroup defaultOpen={false} title="Context">
      <CleanupAppContextToggle />
    </CollapsibleSettingsGroup>
  </div>
);
