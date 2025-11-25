import React from "react";
import { useSettings } from "../../hooks/use-settings";
import { InputGroup, InputGroupInputNumber } from "../ui/input-group";
import { SettingContainer } from "../ui/SettingContainer";

interface HistoryLimitProps {
  descriptionMode?: "tooltip" | "inline";
  grouped?: boolean;
}

export const HistoryLimit: React.FC<HistoryLimitProps> = ({
  descriptionMode = "inline",
  grouped = false,
}) => {
  const { getSetting, updateSetting, isUpdating } = useSettings();

  const historyLimit = getSetting("history_limit") ?? 5;

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(event.target.value, 10);
    if (!isNaN(value) && value >= 0) {
      updateSetting("history_limit", value);
    }
  };

  const handleIncrement = () => {
    if (historyLimit < 1000) {
      updateSetting("history_limit", historyLimit + 1);
    }
  };

  const handleDecrement = () => {
    if (historyLimit > 0) {
      updateSetting("history_limit", historyLimit - 1);
    }
  };

  return (
    <SettingContainer
      title="History Limit"
      description="Maximum number of transcription entries to keep in history"
      descriptionMode={descriptionMode}
      grouped={grouped}
      layout="horizontal"
    >
      <InputGroup className="w-auto">
        <InputGroupInputNumber
          min={0}
          max={1000}
          value={historyLimit}
          onChange={handleChange}
          disabled={isUpdating("history_limit")}
          className="w-16"
          onIncrement={handleIncrement}
          onDecrement={handleDecrement}
          suffix="entries"
        />
      </InputGroup>
    </SettingContainer>
  );
};
