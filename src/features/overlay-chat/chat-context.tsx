import { Download, Loader2, Quote, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CHAT_MODEL_KINDS,
  type ChatModelOption,
} from "@/features/overlay-chat/chat";
import type {
  ChatContextEvent,
  ChatTextContext,
} from "@/features/overlay-controls/runtime/overlay-windows";
import type { PolishModelProgress } from "@/features/polish/polish-model-state";
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

const LoadingChatReference = () => (
  <output
    aria-label="Selected text context"
    className="flex min-w-0 items-center gap-2 rounded-lg bg-white/7 px-3 py-2 text-[12px] text-white/60"
  >
    <Loader2 aria-hidden="true" className="size-3 animate-spin" />
    <span>Checking selected text…</span>
  </output>
);

const AccessibilityChatReference = ({
  onRequestAccessibility,
}: Pick<ChatReferenceProps, "onRequestAccessibility">) => (
  <fieldset
    aria-label="Selected text context"
    className="m-0 flex min-w-0 items-center gap-2 rounded-lg border-0 bg-white/7 px-3 py-2"
  >
    <Quote aria-hidden="true" className="size-3.5 shrink-0 text-white/48" />
    <div className="min-w-0 flex-1">
      <div className="font-medium text-[11px] text-white/72">Selected text</div>
      <div className="truncate text-[12px] text-white/48">
        Accessibility access needed
      </div>
    </div>
    <Button
      className="h-7 shrink-0 rounded-full bg-white px-3 text-[11px] text-black hover:bg-white/88"
      onClick={onRequestAccessibility}
      size="sm"
      type="button"
    >
      Allow
    </Button>
  </fieldset>
);

const SelectedChatReference = ({
  context,
}: Pick<ChatReferenceProps, "context">) => {
  const referenceLabel =
    context?.source === "clipboard" ? "Clipboard text" : "Selected text";
  const label = context?.truncated
    ? `${referenceLabel} · shortened`
    : referenceLabel;
  return (
    <fieldset
      aria-label="Selected text context"
      className="m-0 flex min-w-0 items-start gap-2 rounded-lg border-0 bg-white/7 px-3 py-2"
    >
      <Quote
        aria-hidden="true"
        className="mt-0.5 size-3.5 shrink-0 text-white/48"
      />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-[11px] text-white/72">{label}</div>
        {context === null ? (
          <div className="text-[12px] text-white/52 leading-4">
            No text selected
          </div>
        ) : (
          <blockquote className="line-clamp-2 break-words text-[12px] text-white/58 leading-4 [overflow-wrap:anywhere]">
            {context.text}
          </blockquote>
        )}
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
  return <SelectedChatReference context={context} />;
};

interface BundledModelSetupProps {
  model: BundledChatModel;
  selected: ChatModelOption | null;
}

const bundledModelProgressLabel = (model: BundledChatModel) => {
  const percentage = Math.round(model.progress?.percentage ?? 0);
  if (model.status.state === "downloading") {
    return `Downloading Echo 4B · ${percentage}%`;
  }
  if (model.status.state === "verifying") {
    return `Verifying Echo 4B · ${percentage}%`;
  }
  if (model.status.state === "loading") {
    return "Loading Echo 4B…";
  }
  return "Checking Echo 4B…";
};

const DownloadBundledModel = ({
  download,
}: Pick<BundledChatModel, "download">) => (
  <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-white/7 px-3 py-2">
    <span className="min-w-0 text-[12px] text-white/62">
      Private, on-device
    </span>
    <Button
      aria-label="Download Echo 4B model, 2.5 GB"
      className="h-8 shrink-0 rounded-full bg-white px-3 text-[11px] text-black hover:bg-white/88"
      onClick={download}
      size="sm"
      type="button"
    >
      <Download aria-hidden="true" className="size-3.5" />
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
    className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-red-400/10 px-3 py-2"
    role="alert"
  >
    <span className="min-w-0 truncate text-[12px] text-red-100">{message}</span>
    <Button
      aria-label="Repair Echo 4B model"
      className="h-8 shrink-0 rounded-full bg-white px-3 text-[11px] text-black hover:bg-white/88"
      onClick={repair}
      size="sm"
      type="button"
    >
      <RotateCcw aria-hidden="true" className="size-3.5" />
      Repair
    </Button>
  </div>
);

export const BundledModelSetup = ({
  model,
  selected,
}: BundledModelSetupProps) => {
  if (
    selected?.kind !== CHAT_MODEL_KINDS.bundled ||
    model.status.state === "ready"
  ) {
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
    <output className="flex min-w-0 items-center gap-2 rounded-lg bg-white/7 px-3 py-2 text-[12px] text-white/62">
      <Loader2 aria-hidden="true" className="size-3 animate-spin" />
      <span>{bundledModelProgressLabel(model)}</span>
    </output>
  );
};
