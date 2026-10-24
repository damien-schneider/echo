import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@ctrl-ui/react/ui/dropdown-menu";
import { MonitorIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useTheme } from "@/providers/theme-provider";
export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const getThemeIcon = () => {
    switch (theme) {
      case "light":
        return <SunIcon className="h-4 w-4" />;
      case "dark":
        return <MoonIcon className="h-4 w-4" />;
      default:
        return <MonitorIcon className="h-4 w-4" />;
    }
  };
  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger
        aria-label="Theme"
        iconOnly
        size="md"
        variant="ghost"
      >
        {getThemeIcon()}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top">
        <DropdownMenuRadioGroup
          onValueChange={(value) => {
            if (value === "light" || value === "dark" || value === "system") {
              setTheme(value);
            }
          }}
          value={theme || "system"}
        >
          <DropdownMenuRadioItem closeOnClick value="light">
            <SunIcon className="size-4" />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem closeOnClick value="dark">
            <MoonIcon className="size-4" />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem closeOnClick value="system">
            <MonitorIcon className="size-4" />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
