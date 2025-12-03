import { ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function NativeSelect({
  className,
  wrapperClassName,
  ...props
}: ComponentProps<"select"> & {
  wrapperClassName?: string;
}) {
  return (
    <div
      className={cn(
        "group/native-select relative w-fit has-[select:disabled]:opacity-50",
        wrapperClassName
      )}
      data-slot="native-select-wrapper"
    >
      <select
        className={cn(
          "h-9 w-full min-w-0 cursor-pointer appearance-none rounded-md bg-foreground/5 px-3 py-2 pr-9 text-sm outline-none transition selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground hover:bg-foreground/10 disabled:pointer-events-none disabled:cursor-not-allowed",
          "focus-visible:bg-foreground/15",
          "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
          className
        )}
        data-slot="native-select"
        {...props}
      />
      <ChevronDownIcon
        aria-hidden="true"
        className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3.5 size-4 select-none text-muted-foreground opacity-50"
        data-slot="native-select-icon"
      />
    </div>
  );
}

function NativeSelectOption({ ...props }: React.ComponentProps<"option">) {
  return <option data-slot="native-select-option" {...props} />;
}

function NativeSelectOptGroup({
  className,
  ...props
}: React.ComponentProps<"optgroup">) {
  return (
    <optgroup
      className={cn(className)}
      data-slot="native-select-optgroup"
      {...props}
    />
  );
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption };
