import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, Github, Heart, Info } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CollapsibleSettingsGroup } from "@/components/ui/CollapsibleSettingsGroup";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SettingContainer } from "@/components/ui/SettingContainer";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/hooks/use-settings";
import { AlwaysOnMicrophone } from "../always-on-microphone";
import { AppDataDirectory } from "../app-data-directory";
import { ClamshellMicrophoneSelector } from "../clamshell-microphone-selector";
import { LogDirectory } from "../debug/log-directory";
import { LogLevelSelector } from "../debug/log-level-selector";
import { WordCorrectionThreshold } from "../debug/word-correction-threshold";
import { HistoryLimit } from "../history-limit";
import { MuteWhileRecording } from "../mute-while-recording";
import { RecordingRetentionPeriodSelector } from "../recording-retention-period";
import { SoundPicker } from "../sound-picker";

type AboutDialogProps = {
  trigger?: React.ReactNode;
};

export const AboutDialog: React.FC<AboutDialogProps> = ({ trigger }) => {
  const [version, setVersion] = useState("");
  const [open, setOpen] = useState(false);
  const { getSetting, updateSetting, isUpdating } = useSettings();

  const debugLoggingEnabled = getSetting("debug_logging_enabled") ?? false;

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const appVersion = await getVersion();
        setVersion(appVersion);
      } catch (error) {
        console.error("Failed to get app version:", error);
        setVersion("0.0.0");
      }
    };

    if (open) {
      fetchVersion();
    }
  }, [open]);

  const handleOpenGitHub = async () => {
    try {
      await openUrl("https://github.com/damien-schneider/echo");
    } catch (error) {
      console.error("Failed to open GitHub:", error);
    }
  };

  const handleDonate = async () => {
    try {
      await openUrl("https://github.com/sponsors/damien-schneider");
    } catch (error) {
      console.error("Failed to open donate link:", error);
    }
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            className="rounded-lg"
            size="icon-sm"
            title="About Echo"
            variant="ghost"
          >
            <Info className="size-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            About Echo
          </DialogTitle>
          <DialogDescription>
            Version {version} - Local speech-to-text application
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* About Section */}
          <CollapsibleSettingsGroup defaultOpen={true} title="About">
            <SettingContainer
              description="Current version of Echo"
              grouped={true}
              title="Version"
            >
              <span className="font-mono text-sm">v{version}</span>
            </SettingContainer>

            <AppDataDirectory descriptionMode="tooltip" grouped={true} />

            <SettingContainer
              description="View source code and contribute"
              grouped={true}
              title="Source Code"
            >
              <Button
                className="gap-2"
                onClick={handleOpenGitHub}
                size="sm"
                variant="outline"
              >
                <Github className="h-4 w-4" />
                GitHub
                <ExternalLink className="h-3 w-3" />
              </Button>
            </SettingContainer>

            <SettingContainer
              description="Help us continue building Echo"
              grouped={true}
              title="Support Development"
            >
              <Button
                className="gap-2"
                onClick={handleDonate}
                size="sm"
                variant="default"
              >
                <Heart className="h-4 w-4" />
                Donate
              </Button>
            </SettingContainer>

            <SettingContainer
              description="High-performance inference of OpenAI's Whisper automatic speech recognition model"
              grouped={true}
              layout="stacked"
              title="Powered by Whisper.cpp"
            >
              <p className="text-muted-foreground text-xs">
                Echo uses Whisper.cpp for fast, local speech-to-text processing.
                Thanks to Georgi Gerganov and contributors.
              </p>
            </SettingContainer>
          </CollapsibleSettingsGroup>

          {/* Debug Section */}
          <CollapsibleSettingsGroup
            defaultOpen={false}
            title="Advanced / Debug"
          >
            <SettingContainer
              description="Increase backend log verbosity to help diagnose issues. Logs remain local but may include sensitive snippets."
              descriptionMode="tooltip"
              grouped={true}
              title="Enable Debug Logging"
            >
              <Switch
                checked={debugLoggingEnabled}
                disabled={isUpdating("debug_logging_enabled")}
                onCheckedChange={(value) =>
                  updateSetting("debug_logging_enabled", value)
                }
              />
            </SettingContainer>

            <SoundPicker
              description="Choose a sound theme for recording start and stop feedback"
              label="Sound Theme"
            />

            <WordCorrectionThreshold descriptionMode="tooltip" grouped={true} />
            <HistoryLimit descriptionMode="tooltip" grouped={true} />
            <RecordingRetentionPeriodSelector
              descriptionMode="tooltip"
              grouped={true}
            />
            <AlwaysOnMicrophone descriptionMode="tooltip" grouped={true} />
            <ClamshellMicrophoneSelector
              descriptionMode="tooltip"
              grouped={true}
            />
            <LogDirectory descriptionMode="tooltip" grouped={true} />
            <LogLevelSelector descriptionMode="tooltip" grouped={true} />
            <MuteWhileRecording descriptionMode="tooltip" grouped={true} />
          </CollapsibleSettingsGroup>
        </div>
      </DialogContent>
    </Dialog>
  );
};
