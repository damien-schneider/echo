import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const h1Variants = cva(
  "scroll-m-20 font-extrabold text-4xl tracking-tight lg:text-5xl",
  {
    defaultVariants: {
      variant: "default",
    },
    variants: {
      variant: {
        default: "",
        gradient:
          "bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent",
      },
    },
  }
);

export interface H1Props
  extends React.ComponentProps<"h1">,
    VariantProps<typeof h1Variants> {}

export function H1({ className, variant, ...props }: H1Props) {
  return <h1 className={cn(h1Variants({ variant }), className)} {...props} />;
}

const h2Variants = cva(
  "scroll-m-20 border-b pb-2 font-semibold text-3xl tracking-tight first:mt-0",
  {
    defaultVariants: {
      variant: "default",
    },
    variants: {
      variant: {
        default: "",
      },
    },
  }
);

export interface H2Props
  extends React.ComponentProps<"h2">,
    VariantProps<typeof h2Variants> {}

export function H2({ className, variant, ...props }: H2Props) {
  return <h2 className={cn(h2Variants({ variant }), className)} {...props} />;
}

const pVariants = cva("leading-7 [&:not(:first-child)]:mt-6", {
  defaultVariants: {
    variant: "default",
  },
  variants: {
    variant: {
      default: "",
      muted: "text-muted-foreground",
    },
  },
});

export interface PProps
  extends React.ComponentProps<"p">,
    VariantProps<typeof pVariants> {}

export function P({ className, variant, ...props }: PProps) {
  return <p className={cn(pVariants({ variant }), className)} {...props} />;
}

const listVariants = cva("my-6 ml-6 list-disc [&>li]:mt-2", {
  defaultVariants: {
    variant: "default",
  },
  variants: {
    variant: {
      default: "",
    },
  },
});

export interface ListProps
  extends React.ComponentProps<"ul">,
    VariantProps<typeof listVariants> {}

export function List({ className, variant, ...props }: ListProps) {
  return <ul className={cn(listVariants({ variant }), className)} {...props} />;
}

const inlineCodeVariants = cva(
  "relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono font-semibold text-sm",
  {
    defaultVariants: {
      variant: "default",
    },
    variants: {
      variant: {
        default: "",
      },
    },
  }
);

export interface InlineCodeProps
  extends React.ComponentProps<"code">,
    VariantProps<typeof inlineCodeVariants> {}

export function InlineCode({ className, variant, ...props }: InlineCodeProps) {
  return (
    <code
      className={cn(inlineCodeVariants({ variant }), className)}
      {...props}
    />
  );
}

const leadVariants = cva("text-muted-foreground text-xl", {
  defaultVariants: {
    variant: "default",
  },
  variants: {
    variant: {
      default: "",
    },
  },
});

export interface LeadProps
  extends React.ComponentProps<"p">,
    VariantProps<typeof leadVariants> {}

export function Lead({ className, variant, ...props }: LeadProps) {
  return <p className={cn(leadVariants({ variant }), className)} {...props} />;
}
