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
        iconOnly
        onClick={() =>
          runWindowAction("minimize", () => currentWindow.minimize())
        }
        size="sm"
        variant="quiet"
      >
        <MinusIcon className="size-3.5" />
      </Button>
      <Button
        aria-label="Maximize"
        iconOnly
        onClick={() =>
          runWindowAction("maximize", () => currentWindow.toggleMaximize())
        }
        size="sm"
        variant="quiet"
      >
        <SquareIcon className="size-3" />
      </Button>
      <Button
        aria-label="Close"
        className="[--cui-button-hover-background:var(--destructive)] [--cui-button-hover-foreground:var(--destructive-foreground)]"
        iconOnly
        onClick={() => runWindowAction("close", () => currentWindow.close())}
        size="sm"
        variant="quiet"
      >
        <XIcon className="size-3.5" />
      </Button>
    </div>
  );
}
