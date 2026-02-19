import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const inputVariants = cva(
  "flex h-9 w-full rounded-md bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
  {
    variants: {
      variant: {
        default:
          "border border-input focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        button:
          "bg-foreground/5 px-3 py-1 font-medium text-sm shadow-xs hover:bg-foreground/10 focus-visible:bg-foreground/15 focus-visible:outline-none",
      },
    },
    defaultVariants: {
      variant: "button",
    },
  }
);

export interface InputProps
  extends ComponentProps<"input">,
    VariantProps<typeof inputVariants> {}

function Input({ className, type, variant, ...props }: InputProps) {
  return (
    <input
      className={cn(
        inputVariants({ variant }),
        type === "number" &&
          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        className
      )}
      data-slot="input"
      type={type}
      {...props}
    />
  );
}

export { Input, inputVariants };
