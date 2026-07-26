import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { UpdateIndicator } from "@/features/updates/update-indicator";
import { getNormalizedOsPlatform } from "@/lib/os";
import { cn } from "@/lib/utils";

const isMacOS = getNormalizedOsPlatform() === "mac";

export function AppHeader() {
  const [version, setVersion] = useState("");

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(""));
  }, []);

  return (
    <div
      className={cn(
        "fixed top-1 z-30 inline-flex items-center gap-1",
        isMacOS ? "right-2" : "left-2"
      )}
    >
      <UpdateIndicator />
      {version && (
        <Badge
          className="rounded-full border-0 bg-secondary text-muted-foreground"
          size="sm"
          variant="outline"
        >
          v{version}
        </Badge>
      )}
    </div>
  );
}
