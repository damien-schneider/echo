import { Button } from "@ctrl-ui/react/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@ctrl-ui/react/ui/dialog";
import { Switch } from "@ctrl-ui/react/ui/switch";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, Heart, Info } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import GithubIcon from "@/components/icons/github-icon";
import { AlwaysOnMicrophone } from "@/components/settings/always-on-microphone";
import { AppDataDirectory } from "@/components/settings/app-data-directory";
import { ClamshellMicrophoneSelector } from "@/components/settings/clamshell-microphone-selector";
import { LogDirectory } from "@/components/settings/debug/log-directory";
import { LogLevelSelector } from "@/components/settings/debug/log-level-selector";
import { WordCorrectionThreshold } from "@/components/settings/debug/word-correction-threshold";
import { HistoryLimit } from "@/components/settings/history-limit";
import { MuteWhileRecording } from "@/components/settings/mute-while-recording";
import { RecordingRetentionPeriodSelector } from "@/components/settings/recording-retention-period";
import { SoundPicker } from "@/components/settings/sound-picker";
import { SettingRow } from "@/features/settings/setting-row";
import { SettingsSection } from "@/features/settings/settings-section";
import {
  useIsSettingUpdating,
  useSetting,
  useSettingsStore,
} from "@/stores/settings-store";

interface AboutDialogProps {
  trigger?: React.ReactElement;
}
export const AboutDialog: React.FC<AboutDialogProps> = ({ trigger }) => {
  const [version, setVersion] = useState("");
  const [open, setOpen] = useState(false);
  const debugLoggingEnabled = useSetting("debug_logging_enabled") ?? false;
  const debugLoggingUpdating = useIsSettingUpdating("debug_logging_enabled");
  const updateSetting = useSettingsStore((s) => s.updateSetting);
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
      <DialogTrigger
        render={
          trigger ?? (
            <Button
              className="rounded-lg"
              iconOnly
              size="sm"
              title="About Echo"
              variant="ghost"
            >
              <Info className="size-4" />
            </Button>
          )
        }
      />
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
          <SettingsSection defaultOpen={true} title="About">
            <SettingRow description="Current version of Echo" title="Version">
              <span className="font-mono text-sm">v{version}</span>
            </SettingRow>

            <AppDataDirectory />

            <SettingRow
              description="View source code and contribute"
              title="Source Code"
            >
              <Button
                className="gap-2"
                onClick={handleOpenGitHub}
                size="sm"
                variant="surface"
              >
                <GithubIcon className="h-4 w-4" />
                GitHub
                <ExternalLink className="h-3 w-3" />
              </Button>
            </SettingRow>

            <SettingRow
              description="Help us continue building Echo"
              title="Support Development"
            >
              <Button
                className="gap-2"
                onClick={handleDonate}
                size="sm"
                tone="primary"
                variant="solid"
              >
                <Heart className="h-4 w-4" />
                Donate
              </Button>
            </SettingRow>

            <SettingRow
              description="High-performance inference of OpenAI's Whisper automatic speech recognition model"
              layout="stacked"
              title="Powered by Whisper.cpp"
            >
              <p className="text-muted-foreground text-xs">
                Echo uses Whisper.cpp for fast, local speech-to-text processing.
                Thanks to Georgi Gerganov and contributors.
              </p>
            </SettingRow>
          </SettingsSection>

          <SettingsSection defaultOpen={false} title="Advanced / Debug">
            <SettingRow
              description="Increase backend log verbosity to help diagnose issues. Logs remain local but may include sensitive snippets."
              title="Enable Debug Logging"
            >
              <Switch
                checked={debugLoggingEnabled}
                disabled={debugLoggingUpdating}
                onCheckedChange={(value) =>
                  updateSetting("debug_logging_enabled", value)
                }
              />
            </SettingRow>

            <SoundPicker
              description="Choose a sound theme for recording start and stop feedback"
              label="Sound Theme"
            />

            <WordCorrectionThreshold />
            <HistoryLimit />
            <RecordingRetentionPeriodSelector />
            <AlwaysOnMicrophone />
            <ClamshellMicrophoneSelector />
            <LogDirectory />
            <LogLevelSelector />
            <MuteWhileRecording />
          </SettingsSection>
        </div>
      </DialogContent>
    </Dialog>
  );
};
