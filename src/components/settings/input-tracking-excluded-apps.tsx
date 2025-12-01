import { invoke } from "@tauri-apps/api/core";
import { Ban, Loader2, Plus, X } from "lucide-react";
import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SettingContainer } from "@/components/ui/SettingContainer";
import { useSettings } from "@/hooks/use-settings";

type InstalledApp = [string, string]; // [name, bundle_id]

type InputTrackingExcludedAppsProps = {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
};

export const InputTrackingExcludedApps = ({
  descriptionMode = "tooltip",
  grouped = false,
}: InputTrackingExcludedAppsProps) => {
  const { getSetting, updateSetting, isUpdating } = useSettings();
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);
  const [open, setOpen] = useState(false);
  const [loadingApps, setLoadingApps] = useState(false);
  const [appsLoaded, setAppsLoaded] = useState(false);

  const excludedApps = getSetting("input_tracking_excluded_apps") ?? [];
  const inputTrackingEnabled = getSetting("input_tracking_enabled") ?? false;

  // Lazy load apps only when popover opens
  const fetchApps = useCallback(async () => {
    if (appsLoaded || loadingApps) {
      return;
    }

    setLoadingApps(true);
    try {
      const apps = await invoke<InstalledApp[]>("get_installed_apps");
      setInstalledApps(apps);
      setAppsLoaded(true);
    } catch (error) {
      console.error("Failed to fetch installed apps:", error);
    } finally {
      setLoadingApps(false);
    }
  }, [appsLoaded, loadingApps]);

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && !appsLoaded) {
      fetchApps();
    }
  };

  const addApp = (bundleId: string) => {
    if (!excludedApps.includes(bundleId)) {
      updateSetting("input_tracking_excluded_apps", [
        ...excludedApps,
        bundleId,
      ]);
    }
    setOpen(false);
  };

  const removeApp = (bundleId: string) => {
    updateSetting(
      "input_tracking_excluded_apps",
      excludedApps.filter((id) => id !== bundleId)
    );
  };

  const getAppName = (bundleId: string) => {
    const app = installedApps.find(([, id]) => id === bundleId);
    return app ? app[0] : bundleId;
  };

  if (!inputTrackingEnabled) {
    return null;
  }

  return (
    <SettingContainer
      description="Select applications where input tracking should be disabled (e.g., code editors, password managers)"
      descriptionMode={descriptionMode}
      grouped={grouped}
      icon={<Ban className="h-4 w-4" />}
      title="Excluded Applications"
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1">
          {excludedApps.map((bundleId) => (
            <Badge
              className="flex items-center gap-1"
              key={bundleId}
              variant="secondary"
            >
              {getAppName(bundleId)}
              <button
                className="ml-1 rounded-full hover:bg-muted"
                onClick={() => removeApp(bundleId)}
                type="button"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>

        <Popover onOpenChange={handleOpenChange} open={open}>
          <PopoverTrigger asChild>
            <Button
              disabled={isUpdating("input_tracking_excluded_apps")}
              size="sm"
              variant="outline"
            >
              <Plus className="mr-1 h-3 w-3" />
              Add App
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[300px] p-0">
            <Command>
              <CommandInput placeholder="Search applications..." />
              <CommandList>
                {loadingApps ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-muted-foreground text-sm">
                      Loading apps...
                    </span>
                  </div>
                ) : (
                  <>
                    <CommandEmpty>No applications found.</CommandEmpty>
                    <CommandGroup>
                      {installedApps
                        .filter(
                          ([, bundleId]) => !excludedApps.includes(bundleId)
                        )
                        .map(([name, bundleId]) => (
                          <CommandItem
                            key={bundleId}
                            onSelect={() => addApp(bundleId)}
                            value={`${name} ${bundleId}`}
                          >
                            <div className="flex flex-col">
                              <span>{name}</span>
                              <span className="text-muted-foreground text-xs">
                                {bundleId}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </SettingContainer>
  );
};
