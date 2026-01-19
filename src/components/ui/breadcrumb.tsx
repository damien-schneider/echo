import { Slot } from "@radix-ui/react-slot";
import { ChevronRight, MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";

const Breadcrumb = ({
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"nav"> & {
  separator?: React.ReactNode;
  ref?: React.Ref<HTMLElement>;
}) => <nav aria-label="breadcrumb" ref={ref} {...props} />;
Breadcrumb.displayName = "Breadcrumb";

const BreadcrumbList = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<"ol"> & {
  ref?: React.Ref<HTMLOListElement>;
}) => (
  <ol
    className={cn(
      "flex flex-wrap items-center gap-1.5 break-words text-muted-foreground text-sm sm:gap-2.5",
      className
    )}
    ref={ref}
    {...props}
  />
);
BreadcrumbList.displayName = "BreadcrumbList";

const BreadcrumbItem = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<"li"> & {
  ref?: React.Ref<HTMLLIElement>;
}) => (
  <li
    className={cn("inline-flex items-center gap-1.5", className)}
    ref={ref}
    {...props}
  />
);
BreadcrumbItem.displayName = "BreadcrumbItem";

const BreadcrumbLink = ({
  ref,
  asChild,
  className,
  ...props
}: React.ComponentPropsWithoutRef<"a"> & {
  asChild?: boolean;
  ref?: React.Ref<HTMLAnchorElement>;
}) => {
  const Comp = asChild ? Slot : "a";

  return (
    <Comp
      className={cn("transition-colors hover:text-foreground", className)}
      ref={ref}
      {...props}
    />
  );
};
BreadcrumbLink.displayName = "BreadcrumbLink";

const BreadcrumbPage = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<"span"> & {
  ref?: React.Ref<HTMLSpanElement>;
}) => (
  <span
    aria-current="page"
    aria-disabled="true"
    className={cn("font-normal text-foreground", className)}
    ref={ref}
    role="link"
    {...props}
  />
);
BreadcrumbPage.displayName = "BreadcrumbPage";

const BreadcrumbSeparator = ({
  children,
  className,
  ...props
}: React.ComponentProps<"li">) => (
  <li
    aria-hidden="true"
    className={cn("[&>svg]:h-3.5 [&>svg]:w-3.5", className)}
    role="presentation"
    {...props}
  >
    {children ?? <ChevronRight />}
  </li>
);
BreadcrumbSeparator.displayName = "BreadcrumbSeparator";

const BreadcrumbEllipsis = ({
  className,
  ...props
}: React.ComponentProps<"span">) => (
  <span
    aria-hidden="true"
    className={cn("flex h-9 w-9 items-center justify-center", className)}
    role="presentation"
    {...props}
  >
    <MoreHorizontal className="h-4 w-4" />
    <span className="sr-only">More</span>
  </span>
);
BreadcrumbEllipsis.displayName = "BreadcrumbElipssis";

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
};
