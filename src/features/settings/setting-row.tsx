import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@ctrl-ui/react/ui/field";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SettingRowProps {
  children: ReactNode;
  description?: string;
  disabled?: boolean;
  icon?: ReactNode;
  layout?: "horizontal" | "stacked";
  title: string;
}

export function SettingRow({
  title,
  description,
  children,
  layout = "horizontal",
  disabled = false,
  icon,
}: SettingRowProps) {
  return (
    <Field
      className="gap-3 px-4 py-3"
      disabled={disabled}
      orientation={layout === "stacked" ? "vertical" : "responsive"}
    >
      <FieldContent>
        <FieldLabel className="flex items-center gap-2 font-normal [&>svg]:shrink-0 [&>svg]:text-muted-foreground">
          {icon}
          {title}
        </FieldLabel>
        {description && <FieldDescription>{description}</FieldDescription>}
      </FieldContent>
      <div
        className={cn(
          "min-w-0 max-w-full shrink-0",
          layout === "stacked" && "w-full"
        )}
      >
        {children}
      </div>
    </Field>
  );
}
