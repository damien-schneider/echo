import { Badge } from "@ctrl-ui/react/ui/badge";
import { Switch } from "@ctrl-ui/react/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@ctrl-ui/react/ui/tooltip";
import { AppWindow, FileText, Music, Zap, ZapOff } from "lucide-react";
import { SettingRow } from "@/features/settings/setting-row";
import { cn } from "@/lib/utils";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

const VOICE_COMMANDS = [
  {
    example: '"Open Safari"',
    icon: AppWindow,
    name: "Open Application",
  },
  {
    example: '"Create a note called grocery list with milk and eggs"',
    icon: FileText,
    name: "Create Note",
  },
  {
    example: '"Change the sound theme"',
    icon: Music,
    name: "Change Sound Theme",
  },
] as const;
const ToolSupportBadge = ({ toolSupport }: { toolSupport: boolean | null }) => {
  if (toolSupport === true) {
    return (
      <Badge
        className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        size="sm"
        variant="outline"
      >
        <Zap className="size-2.5" />
        Active
      </Badge>
    );
  }
  if (toolSupport === false) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <Badge
                className="cursor-default gap-1 border-border/30 bg-muted/20 text-muted-foreground/60"
                size="sm"
                variant="outline"
              />
            }
          >
            <ZapOff className="size-2.5" />
            Not supported
          </TooltipTrigger>
          <TooltipContent className="max-w-56">
            <p>
              This model does not support tool calling. Voice commands will fall
              back to text correction.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Badge
              className="cursor-default gap-1 border-border/30 bg-muted/20 text-muted-foreground/60"
              size="sm"
              variant="outline"
            />
          }
        >
          <ZapOff className="size-2.5" />
          May fall back
        </TooltipTrigger>
        <TooltipContent className="max-w-56">
          <p>
            Tool support could not be determined. Echo will automatically fall
            back to text correction if needed.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
export const VoiceCommandsToggle = () => {
  const voiceCommandsEnabled = useSetting("voice_commands_enabled") ?? true;
  const isUpdating = useIsSettingUpdating("voice_commands_enabled");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  return (
    <SettingRow
      description="When enabled, the LLM can execute voice commands (open apps, create notes, change themes) in addition to processing text. When disabled, only text correction is performed."
      title="Enable Voice Commands"
    >
      <Switch
        checked={voiceCommandsEnabled}
        disabled={isUpdating}
        onCheckedChange={(value) =>
          updateSetting("voice_commands_enabled", value)
        }
      />
    </SettingRow>
  );
};
export const ToolCallingSection = ({
  toolSupport,
}: {
  toolSupport: boolean | null;
}) => {
  const voiceCommandsEnabled = useSetting("voice_commands_enabled") ?? true;
  const isActive = voiceCommandsEnabled && toolSupport === true;
  const isDisabledByUser = !voiceCommandsEnabled;
  return (
    <SettingRow
      description="Available voice commands when the feature is enabled and the model supports tool calling."
      layout="stacked"
      title="Available Commands"
    >
      <div className="flex flex-col gap-1.5">
        {VOICE_COMMANDS.map(({ icon: Icon, name, example }) => (
          <div
            className={cn(
              "flex items-center gap-3 rounded-md border px-3 py-2 text-sm",
              isActive
                ? "border-emerald-500/20 bg-emerald-500/5"
                : "border-border/20 bg-muted/5"
            )}
            key={name}
          >
            <Icon
              className={cn(
                "size-4 shrink-0",
                isActive
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-muted-foreground/50"
              )}
            />
            <div className="min-w-0 flex-1">
              <span
                className={cn(
                  "font-medium",
                  isActive ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {name}
              </span>
              <span className="ml-2 text-muted-foreground/60 text-xs">
                e.g. {example}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {isDisabledByUser ? (
                <Badge
                  className="gap-1 border-border/30 bg-muted/20 text-muted-foreground/60"
                  size="sm"
                  variant="outline"
                >
                  <ZapOff className="size-2.5" />
                  Off
                </Badge>
              ) : (
                <ToolSupportBadge toolSupport={toolSupport} />
              )}
            </div>
          </div>
        ))}
      </div>
    </SettingRow>
  );
};
