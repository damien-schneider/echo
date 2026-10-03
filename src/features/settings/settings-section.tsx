import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@ctrl-ui/react/ui/collapsible";
import { FieldGroup } from "@ctrl-ui/react/ui/field";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

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
    <Collapsible className={className} defaultOpen={defaultOpen}>
      <h2>
        <CollapsibleTrigger className="min-h-11 justify-between gap-3 px-1 py-2 text-start">
          <span>
            <span className="block font-semibold text-sm">{title}</span>
            {description && (
              <span className="block text-muted-foreground text-xs">
                {description}
              </span>
            )}
          </span>
          <ChevronRight
            aria-hidden="true"
            className="size-3.5 text-muted-foreground"
          />
        </CollapsibleTrigger>
      </h2>
      <CollapsibleContent>
        <FieldGroup className="gap-0 divide-y divide-border rounded-xl border border-border bg-card">
          {children}
        </FieldGroup>
      </CollapsibleContent>
    </Collapsible>
  );
}
