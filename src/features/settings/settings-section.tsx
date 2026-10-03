import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@ctrl-ui/react/ui/collapsible";
import { FieldGroup } from "@ctrl-ui/react/ui/field";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SettingsSectionProps {
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  description?: string;
  title: string;
}

export function SettingsSection({
  title,
  description,
  children,
  defaultOpen = true,
  className,
}: SettingsSectionProps) {
  return (
    <Collapsible className={cn("mb-6", className)} defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="group flex min-h-11 w-full items-center justify-between gap-3 px-1 py-3 text-left">
        <span>
          <span className="block font-medium text-sm">{title}</span>
          {description && (
            <span className="block text-muted-foreground text-xs">
              {description}
            </span>
          )}
        </span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180 motion-reduce:transition-none" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <FieldGroup className="divide-y divide-border rounded-2xl border border-border bg-card">
          {children}
        </FieldGroup>
      </CollapsibleContent>
    </Collapsible>
  );
}
