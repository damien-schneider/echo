import type { IconProps } from "@phosphor-icons/react";
import { CircleNotchIcon } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

function Spinner({ className, ...props }: Omit<IconProps, "ref">) {
  return (
    <CircleNotchIcon
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      role="status"
      {...props}
    />
  );
}

export { Spinner };
