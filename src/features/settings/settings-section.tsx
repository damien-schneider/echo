import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@ctrl-ui/react/ui/collapsible";
import { FieldGroup } from "@ctrl-ui/react/ui/field";
import { Text } from "@ctrl-ui/react/ui/typography";
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
      <h2 className="pt-3 pb-1.5">
        <CollapsibleTrigger className="min-h-10 justify-between gap-3">
          <span className="flex flex-col">
            <Text weight="semibold">{title}</Text>
            {description && (
              <Text size="caption" tone="muted">
                {description}
              </Text>
            )}
          </span>
          <CaretRightIcon aria-hidden="true" />
        </CollapsibleTrigger>
      </h2>
      <CollapsibleContent>
        <FieldGroup variant="card">{children}</FieldGroup>
      </CollapsibleContent>
    </Collapsible>
  );
}
