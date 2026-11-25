import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { DownloadProgressSchema } from "@/features/model-download/download-state";
import { subscribeEventListeners } from "@/features/overlay-controls/runtime/event-subscription";
import { errorMessage } from "@/lib/utils";

const HTTPS = /^https$/;
const LanguageSourceSchema = z.url({ protocol: HTTPS });

const LanguageSupportSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("listed"),
      languages: z.array(z.string().regex(/^[a-z]{2,3}$/)).nonempty(),
      source: LanguageSourceSchema,
    })
    .strict(),
  z
    .object({
      at_least: z.boolean(),
      count: z.number().int().positive(),
      includes_dialects: z.boolean(),
      kind: z.literal("count"),
      source: LanguageSourceSchema,
    })
    .strict(),
  z.object({ kind: z.literal("undocumented") }).strict(),
]);

export type LanguageSupport = z.infer<typeof LanguageSupportSchema>;

const PolishCatalogModelSchema = z
  .object({
    description: z.string(),
    download_size_mb: z.number().positive(),
    id: z.string(),
    is_active: z.boolean(),
    is_downloaded: z.boolean(),
    is_downloading: z.boolean(),
    languages: LanguageSupportSchema,
    memory_mb: z.number().positive().nullable(),
    name: z.string(),
    partial_download_mb: z.number().nonnegative().nullable(),
    supports_thinking: z.boolean(),
    supports_voice_commands: z.boolean(),
  })
  .strict();

const PolishCatalogSchema = z
  .object({
    models: z.array(PolishCatalogModelSchema).nonempty(),
    selecting_model_id: z.string().nullable(),
  })
  .strict();

export type PolishCatalogModel = z.infer<typeof PolishCatalogModelSchema>;

export type ModelTransfer =
  | { phase: "downloading"; percentage: number }
  | { phase: "verifying" };

const verifyingTransfer: ModelTransfer = { phase: "verifying" };

const CATALOG_ERROR = "Couldn't load language models.";

type ModelCommand =
  | "select_polish_model"
  | "repair_polish_model"
  | "delete_model";

interface LocalModelAction {
  command: ModelCommand;
  modelId: string;
}

interface LocalModelError {
  message: string;
  modelId: string;
}

export const usePolishCatalog = () => {
  const [catalog, setCatalog] = useState<z.infer<typeof PolishCatalogSchema>>();
  const [catalogError, setCatalogError] = useState<string>();
  const [retrySignal, setRetrySignal] = useState(() => new AbortController());
  const [transfers, setTransfers] = useState(
    () => new Map<string, ModelTransfer>()
  );
  const [action, setAction] = useState<LocalModelAction>();
  const [actionError, setActionError] = useState<LocalModelError>();
  const latestRead = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    latestRead.current?.abort();
    const read = new AbortController();
    latestRead.current = read;
    try {
      const payload = await invoke<unknown>("get_polish_models");
      if (!read.signal.aborted) {
        setCatalog(PolishCatalogSchema.parse(payload));
        setCatalogError(undefined);
      }
    } catch (error) {
      if (!read.signal.aborted) {
        console.error("Couldn't load language models", error);
        setCatalogError(CATALOG_ERROR);
      }
    }
  }, []);

  const updateTransfer = useCallback(
    (modelId: string, transfer?: ModelTransfer) => {
      setTransfers((previous) => {
        if (previous.get(modelId) === transfer) {
          return previous;
        }
        const next = new Map(previous);
        if (transfer) {
          next.set(modelId, transfer);
        } else {
          next.delete(modelId);
        }
        return next;
      });
    },
    []
  );

  useEffect(() => {
    const lifecycle = new AbortController();
    const isCancelled = () =>
      lifecycle.signal.aborted || retrySignal.signal.aborted;
    const setTransfer = (modelId: string, transfer?: ModelTransfer) => {
      if (!isCancelled()) {
        updateTransfer(modelId, transfer);
      }
    };
    const subscribeToProgress = (
      event: string,
      phase: ModelTransfer["phase"]
    ) =>
      listen<unknown>(event, ({ payload }) => {
        const parsed = DownloadProgressSchema.safeParse(payload);
        if (parsed.success) {
          setTransfer(
            parsed.data.model_id,
            phase === "downloading"
              ? { percentage: parsed.data.percentage, phase }
              : verifyingTransfer
          );
        }
      });
    const subscribeToTransferEnd = (event: string) =>
      listen<unknown>(event, ({ payload }) => {
        if (!isCancelled() && typeof payload === "string") {
          setTransfer(payload);
          refresh();
        }
      });

    const subscription = subscribeEventListeners({
      afterSubscribe: refresh,
      isCancelled,
      registrations: [
        () =>
          listen("polish-models-changed", () => {
            if (!isCancelled()) {
              refresh();
            }
          }),
        () => subscribeToProgress("model-download-progress", "downloading"),
        () => subscribeToProgress("model-verification-progress", "verifying"),
        () =>
          listen<unknown>("model-verification-started", ({ payload }) => {
            if (typeof payload === "string") {
              setTransfer(payload, verifyingTransfer);
            }
          }),
        () => subscribeToTransferEnd("model-download-complete"),
        () => subscribeToTransferEnd("model-download-failed"),
      ],
    });
    subscription.catch((error) => {
      if (!isCancelled()) {
        console.error("Couldn't watch language models", error);
        setCatalogError(CATALOG_ERROR);
      }
    });
    return () => {
      lifecycle.abort();
      latestRead.current?.abort();
      subscription.then(
        (stop) => stop(),
        () => undefined
      );
    };
  }, [refresh, retrySignal, updateTransfer]);

  const run = async (command: ModelCommand, modelId: string) => {
    setAction({ command, modelId });
    setActionError(undefined);
    updateTransfer(modelId);
    try {
      await invoke(
        command,
        command === "repair_polish_model" ? undefined : { modelId }
      );
    } catch (error) {
      if (command === "delete_model") {
        throw error;
      }
      setActionError({
        message: errorMessage(error, "Something went wrong. Retry."),
        modelId,
      });
    } finally {
      updateTransfer(modelId);
      await refresh();
      setAction(undefined);
    }
  };

  return {
    action,
    actionError,
    catalog,
    catalogError,
    retry: () => {
      setCatalogError(undefined);
      retrySignal.abort();
      setRetrySignal(new AbortController());
    },
    run,
    transfers,
  };
};
