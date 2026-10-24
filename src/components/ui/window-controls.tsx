import { Button } from "@ctrl-ui/react/ui/button";
import { MinusIcon, SquareIcon, XIcon } from "@phosphor-icons/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getNormalizedOsPlatform } from "@/lib/os";

export const usesNativeTrafficLights = getNormalizedOsPlatform() === "mac";

const runWindowAction = (label: string, action: () => Promise<void>) => {
  action().catch((error) => console.error(`Failed to ${label} window`, error));
};

export function WindowControls() {
  if (usesNativeTrafficLights) {
    return null;
  }
  const currentWindow = getCurrentWindow();
  return (
    <div className="flex items-center gap-0.5">
      <Button
        aria-label="Minimize"
        className="text-muted-foreground"
        iconOnly
        onClick={() =>
          runWindowAction("minimize", () => currentWindow.minimize())
        }
        size="sm"
        variant="ghost"
      >
        <MinusIcon className="size-3.5" />
      </Button>
      <Button
        aria-label="Maximize"
        className="text-muted-foreground"
        iconOnly
        onClick={() =>
          runWindowAction("maximize", () => currentWindow.toggleMaximize())
        }
        size="sm"
        variant="ghost"
      >
        <SquareIcon className="size-3" />
      </Button>
      <Button
        aria-label="Close"
        className="text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
        iconOnly
        onClick={() => runWindowAction("close", () => currentWindow.close())}
        size="sm"
        variant="ghost"
      >
        <XIcon className="size-3.5" />
      </Button>
    </div>
  );
}
