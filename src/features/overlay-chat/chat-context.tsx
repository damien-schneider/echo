import { Button } from "@ctrl-ui/react/ui/button";
import {
  ArrowCounterClockwiseIcon,
  CircleNotchIcon,
  DownloadSimpleIcon,
  QuotesIcon,
} from "@phosphor-icons/react";
import type {
  ChatContextEvent,
  ChatTextContext,
} from "@/features/overlay-controls/runtime/overlay-windows";
import type { PolishModelProgress } from "@/features/polish/polish-model-state";
import type { PolishStatus } from "@/lib/types";
import { formatModelSize } from "@/lib/utils/format";

export interface BundledChatModel {
  download: () => Promise<void>;
  error?: string;
  progress?: PolishModelProgress;
  repair: () => Promise<void>;
  status: PolishStatus;
}
interface ChatReferenceProps {
  context: ChatTextContext | null;
  onRequestAccessibility: () => Promise<void>;
  state: ChatContextEvent["state"];
}
const STATUS_ROW_CLASS =
  "m-0 flex min-h-7 min-w-0 items-center gap-2 border-0 p-0 px-1 text-[12px] text-white/45 leading-4";
const LoadingChatReference = () => (
  <output aria-label="Selected text context" className={STATUS_ROW_CLASS}>
    <CircleNotchIcon
      aria-hidden="true"
      className="size-3.5 shrink-0 animate-spin"
    />
    <span className="echo-chat-shimmer shimmer-text">
      Checking selected text…
    </span>
  </output>
);
const AccessibilityChatReference = ({
  onRequestAccessibility,
}: Pick<ChatReferenceProps, "onRequestAccessibility">) => (
  <fieldset aria-label="Selected text context" className={STATUS_ROW_CLASS}>
    <QuotesIcon aria-hidden="true" className="size-3.5 shrink-0" />
    <span className="min-w-0 flex-1 truncate">
      Accessibility access needed to read selected text
    </span>
    <Button
      className="echo-chat-control echo-chat-cta shrink-0"
      onClick={onRequestAccessibility}
      size="sm"
      tone="primary"
      type="button"
      variant="solid"
    >
      Allow
    </Button>
  </fieldset>
);
const EmptyChatReference = () => (
  <fieldset aria-label="Selected text context" className={STATUS_ROW_CLASS}>
    <QuotesIcon aria-hidden="true" className="size-3.5 shrink-0" />
    <span>No text selected</span>
  </fieldset>
);
const SelectedChatReference = ({ context }: { context: ChatTextContext }) => {
  const referenceLabel =
    context.source === "clipboard" ? "Clipboard text" : "Selected text";
  return (
    <fieldset
      aria-label="Selected text context"
      className="m-0 flex min-w-0 items-start gap-2 rounded-xl border-0 bg-white/7 px-3 py-2"
    >
      <QuotesIcon
        aria-hidden="true"
        className="mt-0.5 size-3.5 shrink-0 text-white/48"
      />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-[11px] text-white/55 leading-4">
          {context.truncated ? `${referenceLabel} · shortened` : referenceLabel}
        </div>
        <blockquote className="line-clamp-3 break-words text-[12px] text-white/85 leading-4 [overflow-wrap:anywhere]">
          {context.text}
        </blockquote>
      </div>
    </fieldset>
  );
};
export const ChatReference = ({
  context,
  onRequestAccessibility,
  state,
}: ChatReferenceProps) => {
  if (state === "loading") {
    return <LoadingChatReference />;
  }
  if (state === "permission_required") {
    return (
      <AccessibilityChatReference
        onRequestAccessibility={onRequestAccessibility}
      />
    );
  }
  return context === null ? (
    <EmptyChatReference />
  ) : (
    <SelectedChatReference context={context} />
  );
};
interface BundledModelSetupProps {
  model: BundledChatModel;
}
const bundledModelProgressLabel = (model: BundledChatModel) => {
  const { status, progress } = model;
  const name = status.model?.name ?? "the language model";
  const { state } = status;
  if (state !== "downloading" && state !== "verifying") {
    const verb = state === "loading" ? "Loading" : "Checking";
    return `${verb} ${name}…`;
  }
  const [verb, phase] =
    state === "downloading"
      ? ["Downloading", "download"]
      : ["Verifying", "verification"];
  const suffix =
    progress?.phase === phase ? ` · ${Math.round(progress.percentage)}%` : "…";
  return `${verb} ${name}${suffix}`;
};
const DownloadBundledModel = ({
  download,
  error,
  status,
}: Pick<BundledChatModel, "download" | "error" | "status">) => {
  const { model } = status;
  const sizeMb = model?.download_size_mb;
  const downloadLabel =
    sizeMb && Number.isFinite(sizeMb) && sizeMb > 0
      ? `Download ${formatModelSize(sizeMb)}`
      : "Download model";
  return (
    <div className="echo-chat-callout flex min-w-0 items-center justify-between gap-3 bg-white/7">
      {error ? (
        <span className="min-w-0 text-[12px] text-red-100" role="alert">
          {error}
        </span>
      ) : (
        <span className="min-w-0 text-[12px] text-white/62">
          {model ? `${model.name} · Private, on-device` : "Private, on-device"}
        </span>
      )}
      <Button
        className="echo-chat-control echo-chat-cta shrink-0"
        onClick={download}
        size="sm"
        tone="primary"
        type="button"
        variant="solid"
      >
        <DownloadSimpleIcon aria-hidden="true" className="size-3.5" />
        {downloadLabel}
      </Button>
    </div>
  );
};
const RepairBundledModel = ({
  error,
  repair,
  status,
}: Pick<BundledChatModel, "error" | "repair" | "status">) => (
  <div
    className="echo-chat-callout flex min-w-0 items-center justify-between gap-3 bg-red-400/10"
    role="alert"
  >
    <span className="min-w-0 truncate text-[12px] text-red-100">
      {error ?? status.message}
    </span>
    <Button
      aria-label={`Repair ${status.model?.name ?? "language model"}`}
      className="echo-chat-control echo-chat-cta shrink-0"
      onClick={repair}
      size="sm"
      tone="primary"
      type="button"
      variant="solid"
    >
      <ArrowCounterClockwiseIcon aria-hidden="true" className="size-3.5" />
      Repair
    </Button>
  </div>
);
export const BundledModelSetup = ({ model }: BundledModelSetupProps) => {
  if (model.status.state === "ready") {
    return null;
  }
  if (model.status.state === "not_downloaded") {
    return (
      <DownloadBundledModel
        download={model.download}
        error={model.error}
        status={model.status}
      />
    );
  }
  if (model.status.state === "repair") {
    return (
      <RepairBundledModel
        error={model.error}
        repair={model.repair}
        status={model.status}
      />
    );
  }
  return (
    <output className={STATUS_ROW_CLASS}>
      <CircleNotchIcon
        aria-hidden="true"
        className="size-3.5 shrink-0 animate-spin"
      />
      <span className="echo-chat-shimmer shimmer-text">
        {bundledModelProgressLabel(model)}
      </span>
    </output>
  );
};
