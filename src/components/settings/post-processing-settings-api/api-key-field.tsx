import React, { useState } from "react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

interface ApiKeyFieldProps {
  value: string;
  onBlur: (value: string) => void;
  disabled: boolean;
  placeholder?: string;
  className?: string;
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
