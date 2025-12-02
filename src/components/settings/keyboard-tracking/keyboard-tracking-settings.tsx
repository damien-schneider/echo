import { Keyboard } from "lucide-react";
import { CollapsibleSettingsGroup } from "@/components/ui/CollapsibleSettingsGroup";
import { InputTrackingExcludedApps } from "../input-tracking-excluded-apps";
import { InputTrackingIdleTimeout } from "../input-tracking-idle-timeout";
import { InputTrackingToggle } from "../input-tracking-toggle";

export const KeyboardTrackingSettings = () => (
  <div className="mx-auto w-full max-w-3xl pb-20">
    <CollapsibleSettingsGroup defaultOpen={true} title="Keyboard Tracking">
      <InputTrackingToggle descriptionMode="tooltip" grouped={true} />
      <InputTrackingIdleTimeout descriptionMode="tooltip" grouped={true} />
      <InputTrackingExcludedApps descriptionMode="tooltip" grouped={true} />
    </CollapsibleSettingsGroup>

    {/* Placeholder for future keyboard tracking features */}
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border/50 border-dashed px-4 py-8 text-center text-muted-foreground">
      <Keyboard className="h-10 w-10 opacity-40" />
      <div>
        <p className="font-medium">More features coming soon</p>
        <p className="mt-1 text-sm">
          Additional keyboard tracking customization options will be added here.
        </p>
      </div>
    </div>
  </div>
);
