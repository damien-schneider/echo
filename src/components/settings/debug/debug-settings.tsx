import React from "react";
import { WordCorrectionThreshold } from "./word-correction-threshold";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { HistoryLimit } from "../history-limit";
import { AlwaysOnMicrophone } from "../always-on-microphone";
import { SoundPicker } from "../sound-picker";
import { MuteWhileRecording } from "../mute-while-recording";

export const DebugSettings = () => {
  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup title="Debug">
        <SoundPicker
          label="Sound Theme"
          description="Choose a sound theme for recording start and stop feedback"
        />
        <WordCorrectionThreshold descriptionMode="tooltip" grouped={true} />
        <HistoryLimit descriptionMode="tooltip" grouped={true} />
        <AlwaysOnMicrophone descriptionMode="tooltip" grouped={true} />
        <MuteWhileRecording descriptionMode="tooltip" grouped={true} />
      </SettingsGroup>
    </div>
  );
};
