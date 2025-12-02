import type React from "react";

interface SettingsGroupProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
}

export const SettingsGroup: React.FC<SettingsGroupProps> = ({
  title,
  description,
  children,
}) => (
  <div className="space-y-4">
    {title && (
      <div className="px-4">
        <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-muted-foreground text-xs">{description}</p>
        )}
      </div>
    )}

    <div className="divide-y divide-foreground/10">{children}</div>
  </div>
);
