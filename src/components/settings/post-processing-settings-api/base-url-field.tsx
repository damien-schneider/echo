import { Button } from "@ctrl-ui/react/ui/button";
import { Input } from "@ctrl-ui/react/ui/input";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface BaseUrlFieldProps {
  className?: string;
  defaultBaseUrl?: string;
  disabled: boolean;
  onBlur: (value: string) => void;
  placeholder?: string;
  value: string;
}

export function BaseUrlField(props: BaseUrlFieldProps) {
  return <BaseUrlEditor key={props.value} {...props} />;
}

function BaseUrlEditor({
  value,
  defaultBaseUrl,
  onBlur,
  disabled,
  placeholder,
  className,
}: BaseUrlFieldProps) {
  const [draftUrl, setDraftUrl] = useState(value);
  const canReset =
    !disabled && defaultBaseUrl !== undefined && draftUrl !== defaultBaseUrl;
  const resetUrl = () => {
    if (defaultBaseUrl === undefined) {
      return;
    }
    setDraftUrl(defaultBaseUrl);
    onBlur(defaultBaseUrl);
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Input
        className={cn("min-w-0 flex-1", className)}
        disabled={disabled}
        onBlur={() => onBlur(draftUrl)}
        onChange={(event) => setDraftUrl(event.target.value)}
        placeholder={placeholder}
        type="url"
        value={draftUrl}
      />
      {canReset && (
        <Button
          aria-label="Reset base URL to default"
          iconOnly
          onClick={resetUrl}
          onPointerDown={(event) => event.preventDefault()}
          title={`Reset to default: ${defaultBaseUrl}`}
          variant="ghost"
        >
          <RotateCcw />
        </Button>
      )}
    </div>
  );
}
