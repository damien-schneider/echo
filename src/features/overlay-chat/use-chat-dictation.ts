import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useEffectEvent } from "react";
import { z } from "zod";
import type { ChatDictationState } from "@/features/overlay-chat/session/chat-session-store";
import { listenTranscriptionProgress } from "@/features/overlay-controls/runtime/overlay-event-registrations";
import {
  CHAT_DICTATION_COMMAND,
  CHAT_DICTATION_EVENT,
  type DictatedTranscript,
  DictatedTranscriptSchema,
} from "@/features/overlay-controls/runtime/overlay-windows";
import { listenCancellable } from "@/lib/tauri-listener";

export interface ChatDictation {
  preview: string;
  state: ChatDictationState;
  toggle: () => void;
}

interface ChatDictationPorts {
  onDictated: (dictated: DictatedTranscript) => void;
  onError: (message: string) => void;
  onHeard: (preview: string) => void;
  onStateChange: (state: ChatDictationState) => void;
  preview: string;
  state: ChatDictationState;
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
  onHeard,
  onStateChange,
  preview,
  state,
}: ChatDictationPorts): ChatDictation => {
  const collect = useEffectEvent(() => {
    takeDictated()
      .then((dictated) => {
        onStateChange("idle");
        if (dictated) {
          onDictated(dictated);
        }
      })
      .catch(() => onStateChange("idle"));
  });
  const hear = useEffectEvent(onHeard);
  /// A composer that goes away mid-dictation would leave the microphone open behind it.
  const dropRecording = useEffectEvent(() => {
    if (state === "recording") {
      invoke(CHAT_DICTATION_COMMAND.stop).catch(() => undefined);
    }
    onStateChange("idle");
  });
  useEffect(() => {
    collect();
    const stopListening = listenCancellable(() =>
      listen(CHAT_DICTATION_EVENT, () => collect())
    );
    const stopHearing = listenCancellable(() =>
      listenTranscriptionProgress(hear)
    );
    return () => {
      stopListening();
      stopHearing();
      dropRecording();
    };
  }, []);
  const start = () => {
    onStateChange("recording");
    invoke(CHAT_DICTATION_COMMAND.start).catch((caught) => {
      onStateChange("idle");
      onError(DictationFailureSchema.parse(caught));
    });
  };
  const stop = () => {
    onStateChange("transcribing");
    invoke(CHAT_DICTATION_COMMAND.stop).catch((caught) => {
      onStateChange("idle");
      onError(DictationFailureSchema.parse(caught));
    });
  };
  return {
    preview,
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
