import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { getNormalizedOsPlatform } from "@/lib/os";
import UpdateChecker from "./update-checker/update-checker";

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
      className={`fixed top-1 z-30 inline-flex items-center gap-1 ${isMacOS ? "right-2" : "left-2"}`}
    >
      <UpdateChecker />
      {version && (
        <Badge className="text-muted-foreground" size="sm" variant="outline">
          v{version}
        </Badge>
      )}
    </div>
  );
}
