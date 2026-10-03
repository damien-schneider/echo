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
  description: string;
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
      className={cn(
        "gap-4 px-4 py-4",
        layout === "horizontal" && "flex-wrap sm:flex-nowrap"
      )}
      disabled={disabled}
      orientation={layout === "stacked" ? "vertical" : "horizontal"}
    >
      <FieldContent>
        <FieldLabel className="flex items-center gap-2">
          {icon}
          {title}
        </FieldLabel>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
      <div className={cn("min-w-0", layout === "stacked" && "w-full")}>
        {children}
      </div>
    </Field>
  );
}
