import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface BaseUrlFieldProps {
  value: string;
  onBlur: (value: string) => void;
  onChange?: (value: string) => void;
  disabled: boolean;
  placeholder?: string;
  className?: string;
}

export const BaseUrlField: React.FC<BaseUrlFieldProps> = ({
  value,
  onBlur,
  onChange,
  disabled,
  placeholder,
  className = "",
}) => {
  const [localValue, setLocalValue] = useState(value);

  // Sync with prop changes
  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    setLocalValue(newValue);
    onChange?.(newValue);
  };

  const disabledMessage = disabled
    ? "Base URL is managed by the selected provider."
    : undefined;

  return (
    <Input
      className={cn("min-w-[360px] flex-1", className)}
      disabled={disabled}
      onBlur={() => onBlur(localValue)}
      onChange={handleChange}
      placeholder={placeholder}
      title={disabledMessage}
      type="text"
      value={localValue}
    />
  );
};

BaseUrlField.displayName = "BaseUrlField";
