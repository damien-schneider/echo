import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { AboutDialog } from "../settings/about/about-dialog";
import UpdateChecker from "../update-checker";

const Footer = () => {
  const [version, setVersion] = useState("");

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const appVersion = await getVersion();
        setVersion(appVersion);
      } catch (error) {
        console.error("Failed to get app version:", error);
        setVersion("0.1.2");
      }
    };

    fetchVersion();
  }, []);

  return (
    <div
      className="flex items-center justify-between border-border/20 border-t px-4 py-3 text-text/60 text-xs"
      data-tauri-drag-region
    >
      <div className="flex items-center gap-2">
        <AboutDialog />
      </div>

      {/* Update Status */}
      <div className="flex items-center gap-1">
        <UpdateChecker />
        <Badge size={"sm"} variant={"outline"}>
          v{version}
        </Badge>
      </div>
    </div>
  );
};

export default Footer;
