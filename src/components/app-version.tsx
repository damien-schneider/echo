import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";
import { UpdateIndicator } from "@/features/updates/update-indicator";
import { cn } from "@/lib/utils";

export function AppVersion({ className }: { className?: string }) {
  const [version, setVersion] = useState("");
  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(""));
  }, []);
  return (
    <div className={cn("flex min-w-0 items-center gap-0.5", className)}>
      <UpdateIndicator className="min-w-0" />
      {version && (
        <span className="shrink-0 px-1 text-caption text-muted-foreground tabular-nums">
          v{version}
        </span>
      )}
    </div>
  );
}
