import { Button } from "@ctrl-ui/react/ui/button";
import { CircleNotchIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import { usePolishModel } from "@/features/polish/use-polish-model";
import { SettingRow } from "@/features/settings/setting-row";

export const EchoModelRow = () => {
  const polish = usePolishModel();
  const { state } = polish.status;
  if (state === "not_downloaded") {
    return (
      <SettingRow
        description="One-time 2.5 GB download. Until then, dictations paste without post-processing."
        title="Echo 4B"
      >
        <Button
          onClick={polish.download}
          size="sm"
          tone="primary"
          variant="solid"
        >
          <DownloadSimpleIcon aria-hidden="true" className="mr-1 h-4 w-4" />
          Download
        </Button>
      </SettingRow>
    );
  }
  if (state === "repair") {
    return (
      <SettingRow
        description={polish.status.message}
        title="Echo 4B needs repair"
      >
        <Button onClick={polish.repair} size="sm" variant="surface">
          Repair
        </Button>
      </SettingRow>
    );
  }
  if (state === "downloading") {
    const percentage = Math.round(polish.progress?.percentage ?? 0);
    return (
      <SettingRow description="One-time 2.5 GB download." title="Echo 4B">
        <span className="flex items-center gap-1.5 text-caption text-muted-foreground tabular-nums">
          <CircleNotchIcon
            aria-hidden="true"
            className="h-3.5 w-3.5 animate-spin"
          />
          {percentage}%
        </span>
      </SettingRow>
    );
  }
  return (
    <SettingRow
      description="Runs on this computer. Nothing you dictate leaves it."
      title="Echo 4B"
    >
      <span className="text-caption text-muted-foreground">
        {state === "ready" ? "Ready" : "Preparing…"}
      </span>
    </SettingRow>
  );
};
