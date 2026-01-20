import type React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/Select";

interface DropdownOption {
  value: string;
  label: string;
}

interface ProviderSelectProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export const ProviderSelect: React.FC<ProviderSelectProps> = ({
  options,
  value,
  onChange,
  disabled,
}) => (
  <Select disabled={disabled} onValueChange={onChange} value={value}>
    <SelectTrigger className="flex-1">
      <SelectValue placeholder="Select a provider" />
    </SelectTrigger>
    <SelectContent>
      {options.map((option) => (
        <SelectItem key={option.value} value={option.value}>
          {option.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

ProviderSelect.displayName = "ProviderSelect";
