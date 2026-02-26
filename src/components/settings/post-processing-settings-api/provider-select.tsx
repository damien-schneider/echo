import type React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DropdownOption {
  label: string;
  value: string;
}

interface ProviderSelectProps {
  disabled?: boolean;
  onChange: (value: string) => void;
  options: DropdownOption[];
  value: string;
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
