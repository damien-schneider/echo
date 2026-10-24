import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@ctrl-ui/react/ui/collapsible";
import { FieldGroup } from "@ctrl-ui/react/ui/field";
import { CaretRightIcon } from "@phosphor-icons/react";
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
        <CollapsibleTrigger className="min-h-10 justify-between gap-3 px-1 pt-3 pb-1.5 text-start">
          <span>
            <span className="block font-semibold text-body">{title}</span>
            {description && (
              <span className="block text-caption text-muted-foreground">
                {description}
              </span>
            )}
          </span>
          <CaretRightIcon
            aria-hidden="true"
            className="size-3.5 text-muted-foreground"
          />
        </CollapsibleTrigger>
      </h2>
      <CollapsibleContent>
        <FieldGroup className="gap-0 divide-y divide-surface-divider rounded-panel bg-surface-group">
          {children}
        </FieldGroup>
      </CollapsibleContent>
    </Collapsible>
  );
}
