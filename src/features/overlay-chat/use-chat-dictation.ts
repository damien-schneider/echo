import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useEffectEvent, useState } from "react";
import { z } from "zod";
import {
  CHAT_DICTATION_COMMAND,
  CHAT_DICTATION_EVENT,
  type DictatedTranscript,
  DictatedTranscriptSchema,
} from "@/features/overlay-controls/runtime/overlay-windows";
import { listenCancellable } from "@/lib/tauri-listener";

export type ChatDictationState = "idle" | "recording" | "transcribing";

export interface ChatDictation {
  state: ChatDictationState;
  toggle: () => void;
}

interface ChatDictationPorts {
  onDictated: (dictated: DictatedTranscript) => void;
  onError: (message: string) => void;
}

const DictationFailureSchema = z.string().catch("Couldn’t dictate. Try again.");

const takeDictated = async () => {
  const payload = await invoke<unknown>(CHAT_DICTATION_COMMAND.take);
  const dictated = DictatedTranscriptSchema.safeParse(payload);
  return dictated.success ? dictated.data : null;
};

/// A dictation started here never reaches a caret — Rust holds the transcript until the composer takes it.
export const useChatDictation = ({
  onDictated,
  onError,
}: ChatDictationPorts): ChatDictation => {
  const [state, setState] = useState<ChatDictationState>("idle");
  const collect = useEffectEvent(() => {
    takeDictated()
      .then((dictated) => {
        setState("idle");
        if (dictated) {
          onDictated(dictated);
        }
      })
      .catch(() => setState("idle"));
  });
  /// A composer that goes away mid-dictation would leave the microphone open behind it.
  const dropRecording = useEffectEvent(() => {
    if (state === "recording") {
      invoke(CHAT_DICTATION_COMMAND.stop).catch(() => undefined);
    }
  });
  useEffect(() => {
    collect();
    const stopListening = listenCancellable(() =>
      listen(CHAT_DICTATION_EVENT, () => collect())
    );
    return () => {
      stopListening();
      dropRecording();
    };
  }, []);
  const start = () => {
    setState("recording");
    invoke(CHAT_DICTATION_COMMAND.start).catch((caught) => {
      setState("idle");
      onError(DictationFailureSchema.parse(caught));
    });
  };
  const stop = () => {
    setState("transcribing");
    invoke(CHAT_DICTATION_COMMAND.stop).catch((caught) => {
      setState("idle");
      onError(DictationFailureSchema.parse(caught));
    });
  };
  return {
    state,
    toggle: () => {
      if (state === "recording") {
        stop();
        return;
      }
      if (state === "idle") {
        start();
      }
    },
  };
};
