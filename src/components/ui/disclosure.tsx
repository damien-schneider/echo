"use client";
import {
  AnimatePresence,
  MotionConfig,
  type MotionProps,
  motion,
} from "motion/react";
import {
  type Attributes,
  Children,
  cloneElement,
  createContext,
  isValidElement,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useState,
} from "react";
import { cn } from "@/lib/utils";

type VariantDefinition = Record<string, string | number>;

export interface DisclosureContextType {
  open: boolean;
  toggle: () => void;
  variants?: { expanded: VariantDefinition; collapsed: VariantDefinition };
}

const DisclosureContext = createContext<DisclosureContextType | undefined>(
  undefined
);

export interface DisclosureProviderProps {
  children: ReactNode;
  onOpenChange?: (open: boolean) => void;
  open: boolean;
  variants?: { expanded: VariantDefinition; collapsed: VariantDefinition };
}

function DisclosureProvider({
  children,
  open: openProp,
  onOpenChange,
  variants,
}: DisclosureProviderProps) {
  const [internalOpenValue, setInternalOpenValue] = useState<boolean>(openProp);

  useEffect(() => {
    setInternalOpenValue(openProp);
  }, [openProp]);

  const toggle = () => {
    const newOpen = !internalOpenValue;
    setInternalOpenValue(newOpen);
    if (onOpenChange) {
      onOpenChange(newOpen);
    }
  };

  return (
    <DisclosureContext.Provider
      value={{
        open: internalOpenValue,
        toggle,
        variants,
      }}
    >
      {children}
    </DisclosureContext.Provider>
  );
}

function useDisclosure() {
  const context = useContext(DisclosureContext);
  if (!context) {
    throw new Error("useDisclosure must be used within a DisclosureProvider");
  }
  return context;
}

export interface DisclosureProps {
  children: ReactNode;
  className?: string;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  transition?: MotionProps["transition"];
  variants?: { expanded: VariantDefinition; collapsed: VariantDefinition };
}

export function Disclosure({
  open: openProp = false,
  onOpenChange,
  children,
  className,
  transition,
  variants,
}: DisclosureProps) {
  return (
    <MotionConfig transition={transition}>
      <div className={className}>
        <DisclosureProvider
          onOpenChange={onOpenChange}
          open={openProp}
          variants={variants}
        >
          {Children.toArray(children)[0]}
          {Children.toArray(children)[1]}
        </DisclosureProvider>
      </div>
    </MotionConfig>
  );
}

export function DisclosureTrigger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { toggle, open } = useDisclosure();

  return (
    <>
      {Children.map(children, (child) => {
        if (!isValidElement(child)) {
          return child;
        }
        const childProps = child.props as Record<string, unknown>;
        return cloneElement(child, {
          onClick: toggle,
          role: "button",
          "aria-expanded": open,
          tabIndex: 0,
          onKeyDown: (e: { key: string; preventDefault: () => void }) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggle();
            }
          },
          className: cn(className, childProps.className as string | undefined),
          ...childProps,
        } as Attributes);
      })}
    </>
  );
}

export function DisclosureContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { open, variants } = useDisclosure();
  const uniqueId = useId();

  const BASE_VARIANTS = {
    expanded: {
      height: "auto",
      opacity: 1,
    },
    collapsed: {
      height: 0,
      opacity: 0,
    },
  };

  const combinedVariants = {
    expanded: { ...BASE_VARIANTS.expanded, ...variants?.expanded },
    collapsed: { ...BASE_VARIANTS.collapsed, ...variants?.collapsed },
  };

  return (
    <div className={cn("overflow-hidden", className)}>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            animate="expanded"
            exit="collapsed"
            id={uniqueId}
            initial="collapsed"
            variants={combinedVariants}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default {
  Disclosure,
  DisclosureProvider,
  DisclosureTrigger,
  DisclosureContent,
};
