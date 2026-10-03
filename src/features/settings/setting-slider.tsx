import { Slider, type SliderProps } from "@ctrl-ui/react/ui/slider";
import type { ReactNode } from "react";
import { SettingRow } from "@/features/settings/setting-row";

interface SettingSliderProps extends SliderProps {
  description?: string;
  icon?: ReactNode;
  label: string;
}

export function SettingSlider({
  description,
  icon,
  label,
  disabled,
  ...props
}: SettingSliderProps) {
  const control = (
    <Slider
      className="w-48 max-w-full"
      disabled={disabled}
      label={label}
      {...props}
    />
  );
  if (!description) {
    return control;
  }
  return (
    <SettingRow
      description={description}
      disabled={disabled}
      icon={icon}
      title={label}
    >
      {control}
    </SettingRow>
  );
}
