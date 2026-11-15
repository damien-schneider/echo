import {
  Combobox,
  ComboboxGroup,
  ComboboxItem,
  type ComboboxItemProps,
  ComboboxPopover,
  ComboboxProvider,
  Portal,
  useComboboxContext,
  useComboboxStore,
} from "@ariakit/react";
import { filterWords } from "@platejs/combobox";
import {
  type UseComboboxInputResult,
  useComboboxInput,
  useHTMLInputCursorState,
} from "@platejs/combobox/react";
import { cva } from "class-variance-authority";
import type { Point, TElement } from "platejs";
import { useComposedRef, useEditorRef } from "platejs/react";
import {
  type ComponentProps,
  createContext,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
  startTransition,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";

function useRequiredComboboxContext() {
  const ctx = useComboboxContext();
  if (!ctx) {
    throw new Error("Component must be used within ComboboxProvider");
  }
  return ctx;
}

interface InlineComboboxContextValue {
  inputProps: UseComboboxInputResult["props"];
  inputRef: RefObject<HTMLInputElement | null>;
  removeInput: UseComboboxInputResult["removeInput"];
  setHasEmpty: (hasEmpty: boolean) => void;
  showTrigger: boolean;
  trigger: string;
}

const InlineComboboxContext = createContext<InlineComboboxContextValue | null>(
  null
);

function useInlineComboboxContext() {
  const ctx = useContext(InlineComboboxContext);
  if (!ctx) {
    throw new Error("Component must be used within InlineCombobox");
  }
  return ctx;
}

interface InlineComboboxProps {
  children: ReactNode;
  element: TElement;
  setValue?: (value: string) => void;
  showTrigger?: boolean;
  trigger: string;
  value?: string;
}

const InlineCombobox = ({
  children,
  element,
  setValue: setValueProp,
  showTrigger = true,
  trigger,
  value: valueProp,
}: InlineComboboxProps) => {
  const editor = useEditorRef();
  const inputRef = useRef<HTMLInputElement>(null);
  const cursorState = useHTMLInputCursorState(inputRef);

  const [valueState, setValueState] = useState("");
  const hasValueProp = valueProp !== undefined;
  const value = hasValueProp ? valueProp : valueState;

  const setValue = (newValue: string) => {
    setValueProp?.(newValue);

    if (!hasValueProp) {
      setValueState(newValue);
    }
  };

  // Where to reinsert the typed text if the combobox closes on a selection change.
  const insertPoint = useRef<Point | null>(null);

  useEffect(() => {
    const path = editor.api.findPath(element);

    if (!path) {
      return;
    }

    const point = editor.api.before(path);

    if (!point) {
      return;
    }

    const pointRef = editor.api.pointRef(point);
    insertPoint.current = pointRef.current;

    return () => {
      pointRef.unref();
    };
  }, [editor, element]);

  const { props: inputProps, removeInput } = useComboboxInput({
    cancelInputOnBlur: true,
    cursorState,
    onCancelInput: (cause) => {
      if (cause !== "backspace") {
        editor.tf.insertText(trigger + value, {
          at: insertPoint.current ?? undefined,
        });
      }
      if (cause === "arrowLeft" || cause === "arrowRight") {
        editor.tf.move({
          distance: 1,
          reverse: cause === "arrowLeft",
        });
      }
    },
    ref: inputRef,
  });

  const [hasEmpty, setHasEmpty] = useState(false);

  const contextValue: InlineComboboxContextValue = {
    inputProps,
    inputRef,
    removeInput,
    setHasEmpty,
    showTrigger,
    trigger,
  };

  const store = useComboboxStore({
    setValue: (newValue) => startTransition(() => setValue(newValue)),
  });

  const items = store.useState("items");

  useEffect(() => {
    if (!store.getState().activeId) {
      store.setActiveId(store.first());
    }
  }, [store]);

  return (
    <span contentEditable={false}>
      <ComboboxProvider open={items.length > 0 || hasEmpty} store={store}>
        <InlineComboboxContext.Provider value={contextValue}>
          {children}
        </InlineComboboxContext.Provider>
      </ComboboxProvider>
    </span>
  );
};

const InlineComboboxInput = ({
  className,
  ref: propRef,
  ...props
}: HTMLAttributes<HTMLInputElement> & {
  ref?: RefObject<HTMLInputElement | null>;
}) => {
  const {
    inputProps,
    inputRef: contextRef,
    showTrigger,
    trigger,
  } = useInlineComboboxContext();

  const store = useRequiredComboboxContext();
  const value = store.useState("value");

  const ref = useComposedRef(propRef, contextRef);

  // Auto-resizing input: a hidden span holds the value, the input sits on top of it.
  return (
    <>
      {showTrigger && trigger}

      <span className="relative min-h-[1lh]">
        <span
          aria-hidden="true"
          className="invisible overflow-hidden text-nowrap"
        >
          {value || "\u200B"}
        </span>

        <Combobox
          autoSelect
          className={cn(
            "absolute top-0 left-0 size-full bg-transparent outline-none",
            className
          )}
          ref={ref}
          value={value}
          {...inputProps}
          {...props}
        />
      </span>
    </>
  );
};

const InlineComboboxContent: typeof ComboboxPopover = ({
  className,
  ...props
}) => {
  // Portal prevents CSS from leaking into popover
  return (
    <Portal>
      <ComboboxPopover
        className={cn(
          "z-500 max-h-[288px] w-[300px] overflow-y-auto rounded-md bg-popover shadow-md",
          className
        )}
        {...props}
      />
    </Portal>
  );
};

const comboboxItemVariants = cva(
  "relative mx-1 flex h-[28px] select-none items-center rounded-sm px-2 text-foreground text-sm outline-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    defaultVariants: {
      interactive: true,
    },
    variants: {
      interactive: {
        false: "",
        true: "cursor-pointer transition-colors hover:bg-accent hover:text-accent-foreground data-[active-item=true]:bg-accent data-[active-item=true]:text-accent-foreground",
      },
    },
  }
);

const InlineComboboxItem = ({
  className,
  onClick,
  ...props
}: ComboboxItemProps & Required<Pick<ComboboxItemProps, "value">>) => {
  const { removeInput } = useInlineComboboxContext();
  const store = useRequiredComboboxContext();
  const search = store.useState("value");

  if (!filterWords(props.value, search)) {
    return null;
  }

  return (
    <ComboboxItem
      className={cn(comboboxItemVariants(), className)}
      onClick={(event) => {
        removeInput(true);
        onClick?.(event);
      }}
      {...props}
    />
  );
};

const InlineComboboxEmpty = ({
  children,
  className,
}: HTMLAttributes<HTMLDivElement>) => {
  const { setHasEmpty } = useInlineComboboxContext();
  const store = useRequiredComboboxContext();
  const items = store.useState("items");

  useEffect(() => {
    setHasEmpty(true);

    return () => {
      setHasEmpty(false);
    };
  }, [setHasEmpty]);

  if (items.length > 0) {
    return null;
  }

  return (
    <div
      className={cn(comboboxItemVariants({ interactive: false }), className)}
    >
      {children}
    </div>
  );
};

function InlineComboboxGroup({
  className,
  ...props
}: ComponentProps<typeof ComboboxGroup>) {
  return (
    <ComboboxGroup
      {...props}
      className={cn(
        "hidden not-last:border-b py-1.5 [&:has([role=option])]:block",
        className
      )}
    />
  );
}

export {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxInput,
  InlineComboboxItem,
};
