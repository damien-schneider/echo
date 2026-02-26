import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ApiKeyFieldProps {
  className?: string;
  disabled: boolean;
  onBlur: (value: string) => void;
  placeholder?: string;
  value: string;
}

export const ApiKeyField: React.FC<ApiKeyFieldProps> = ({
  value,
  onBlur,
  disabled,
  placeholder,
  className = "",
}) => {
  const [localValue, setLocalValue] = useState(value);

  // Sync with prop changes
  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <Input
      className={cn("min-w-[320px] flex-1", className)}
      disabled={disabled}
      onBlur={() => onBlur(localValue)}
      onChange={(event) => setLocalValue(event.target.value)}
      placeholder={placeholder}
      type="password"
      value={localValue}
    />
  );
};

ApiKeyField.displayName = "ApiKeyField";
