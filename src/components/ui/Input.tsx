import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { ComponentProps } from "react";

const inputVariants = cva(
  "flex h-9 w-full rounded-md bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground   disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
  {
    variants: {
      variant: {
        default: "focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none border border-input",
        button:
          "bg-foreground/5 focus-visible:bg-foreground/15 hover:bg-foreground/10 shadow-xs px-3 py-1 text-sm font-medium focus-visible:outline-none",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface InputProps
  extends ComponentProps<"input">,
    VariantProps<typeof inputVariants> {}

function Input({ className, type, variant, ...props }: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        inputVariants({ variant }),
        type === "number" &&
          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        className,
      )}
      {...props}
    />
  );
}

export { Input, inputVariants }
