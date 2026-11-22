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
import {
  type PolishModelProgress,
  polishModelName,
} from "@/features/polish/polish-model-state";
import type { PolishStatus } from "@/lib/types";
export interface BundledChatModel {
  download: () => Promise<void>;
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
  const percentage = Math.round(model.progress?.percentage ?? 0);
  if (model.status.state === "downloading") {
    return `Downloading ${polishModelName} · ${percentage}%`;
  }
  if (model.status.state === "verifying") {
    return `Verifying ${polishModelName} · ${percentage}%`;
  }
  if (model.status.state === "loading") {
    return `Loading ${polishModelName}…`;
  }
  return `Checking ${polishModelName}…`;
};
const DownloadBundledModel = ({
  download,
}: Pick<BundledChatModel, "download">) => (
  <div className="echo-chat-callout flex min-w-0 items-center justify-between gap-3 bg-white/7">
    <span className="min-w-0 text-[12px] text-white/62">
      Private, on-device
    </span>
    <Button
      aria-label={`Download ${polishModelName} model, 2.5 GB`}
      className="echo-chat-control echo-chat-cta shrink-0"
      onClick={download}
      size="sm"
      tone="primary"
      type="button"
      variant="solid"
    >
      <DownloadSimpleIcon aria-hidden="true" className="size-3.5" />
      Download 2.5 GB
    </Button>
  </div>
);
interface RepairBundledModelProps {
  message: string;
  repair: () => Promise<void>;
}
const RepairBundledModel = ({ message, repair }: RepairBundledModelProps) => (
  <div
    className="echo-chat-callout flex min-w-0 items-center justify-between gap-3 bg-red-400/10"
    role="alert"
  >
    <span className="min-w-0 truncate text-[12px] text-red-100">{message}</span>
    <Button
      aria-label={`Repair ${polishModelName} model`}
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
    return <DownloadBundledModel download={model.download} />;
  }
  if (model.status.state === "repair") {
    return (
      <RepairBundledModel
        message={model.status.message}
        repair={model.repair}
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
