import { Fallback, Image, Root } from "@radix-ui/react-avatar";

import { cn } from "@/lib/utils";

const Avatar = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Root> & {
  ref?: React.Ref<React.ElementRef<typeof Root>>;
}) => (
  <Root
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      className
    )}
    ref={ref}
    {...props}
  />
);
Avatar.displayName = Root.displayName;

const AvatarImage = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Image> & {
  ref?: React.Ref<React.ElementRef<typeof Image>>;
}) => (
  <Image
    className={cn("aspect-square h-full w-full", className)}
    ref={ref}
    {...props}
  />
);
AvatarImage.displayName = Image.displayName;

const AvatarFallback = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Fallback> & {
  ref?: React.Ref<React.ElementRef<typeof Fallback>>;
}) => (
  <Fallback
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-muted",
      className
    )}
    ref={ref}
    {...props}
  />
);
AvatarFallback.displayName = Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };
