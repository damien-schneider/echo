import { ChevronDown } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Disclosure, DisclosureContent, DisclosureTrigger } from "./disclosure";

type CollapsibleSettingsGroupProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
};

export const CollapsibleSettingsGroup: React.FC<
  CollapsibleSettingsGroupProps
> = ({ title, description, children, defaultOpen = true, className }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Disclosure
      className={cn("space-y-4", className)}
      onOpenChange={setIsOpen}
      open={isOpen}
      transition={{ duration: 0.2, ease: "easeInOut" }}
    >
      <DisclosureTrigger>
        <div className="flex cursor-pointer items-center justify-between rounded-md px-4 py-2 transition-colors hover:bg-muted/50">
          <div>
            <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-muted-foreground text-xs">
                {description}
              </p>
            )}
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-200",
              isOpen && "rotate-180"
            )}
          />
        </div>
      </DisclosureTrigger>
      <DisclosureContent>
        <div className="divide-y divide-foreground/10 pb-16">{children}</div>
      </DisclosureContent>
    </Disclosure>
  );
};
