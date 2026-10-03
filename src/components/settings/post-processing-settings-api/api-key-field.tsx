import { Input } from "@ctrl-ui/react/ui/input";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface ApiKeyFieldProps {
  className?: string;
  disabled: boolean;
  onBlur: (value: string) => void;
  placeholder?: string;
  value: string;
}

export function ApiKeyField(props: ApiKeyFieldProps) {
  return <ApiKeyEditor key={props.value} {...props} />;
}

function ApiKeyEditor({
  value,
  onBlur,
  disabled,
  placeholder,
  className,
}: ApiKeyFieldProps) {
  const [draftApiKey, setDraftApiKey] = useState(value);
  return (
    <Input
      className={cn("min-w-0 flex-1", className)}
      disabled={disabled}
      onBlur={() => onBlur(draftApiKey)}
      onChange={(event) => setDraftApiKey(event.target.value)}
      placeholder={placeholder}
      type="password"
      value={draftApiKey}
    />
  );
}
