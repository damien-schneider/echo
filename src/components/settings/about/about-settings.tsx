import React, { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { SettingContainer } from "../../ui/SettingContainer";
import { Button } from "../../ui/Button";
import { AppDataDirectory } from "../app-data-directory";

export const AboutSettings: React.FC = () => {
  const [version, setVersion] = useState("");

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const appVersion = await getVersion();
        setVersion(appVersion);
      } catch (error) {
        console.error("Failed to get app version:", error);
        setVersion("0.1.2");
      }
    };

    fetchVersion();
  }, []);

  const handleDonateClick = async () => {
    try {
      await openUrl("https://github.com/sponsors/damien-schneider");
    } catch (error) {
      console.error("Failed to open donate link:", error);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsGroup title="About">
        <SettingContainer
          title="Version"
          description="Current version of Echo"
          grouped={true}
        >
          <span className="text-sm font-mono">v{version}</span>
        </SettingContainer>

        <AppDataDirectory descriptionMode="tooltip" grouped={true} />

        <SettingContainer
          title="Source Code"
          description="View source code and contribute"
          grouped={true}
        >
          <Button

            size="default"
            onClick={() => openUrl("https://github.com/damien-schneider/echo")}
          >
            View on GitHub
          </Button>
        </SettingContainer>

        <SettingContainer
          title="Support Development"
          description="Help us continue building Echo"
          grouped={true}
        >
          <Button variant="default" size="default" onClick={handleDonateClick}>
            Donate
          </Button>
        </SettingContainer>
      </SettingsGroup>

      <SettingsGroup title="Acknowledgments">
        <SettingContainer
          title="Whisper.cpp"
          description="High-performance inference of OpenAI's Whisper automatic speech recognition model"
          grouped={true}
          layout="stacked"
        >
          <div className="text-sm text-muted-foreground">
            Echo uses Whisper.cpp for fast, local speech-to-text processing.
            Thanks to the amazing work by Georgi Gerganov and contributors.
          </div>
        </SettingContainer>
      </SettingsGroup>
    </div>
  );
};
