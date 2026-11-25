import {
  ChatComposer,
  ChatComposerShell,
  ChatComposerSubmit,
  ChatComposerTextarea,
  ChatComposerToolbar,
  ChatComposerTools,
} from "@ctrl-ui/react/chat-composer";
import { Button } from "@ctrl-ui/react/ui/button";
import { Toggle } from "@ctrl-ui/react/ui/toggle";
import { ArrowUpIcon, LightbulbIcon, SquareIcon } from "@phosphor-icons/react";
import type { MotionValue } from "motion/react";
import { useEffect, useState } from "react";
import { withDictationPreview } from "@/features/overlay-chat/chat";
import {
  PROMPT_MENU_ID,
  promptOptionId,
} from "@/features/overlay-chat/prompt-picker/prompt-menu-list";
import type { PromptMenu } from "@/features/overlay-chat/prompt-picker/use-prompt-menu";
import type { ChatDictation } from "@/features/overlay-chat/use-chat-dictation";
import type { ChatSession } from "@/features/overlay-chat/use-chat-session";
import { GlyphSwap } from "@/features/overlay-controls/glyph/glyph-swap";
import { RecordGlyph } from "@/features/overlay-controls/glyph/record-glyph";
import { useFollowLatestText } from "@/features/overlay-controls/use-follow-latest-text";

const DICTATION_LABEL = {
  idle: "Dictate a message",
  recording: "Stop dictating",
  transcribing: "Transcribing…",
} as const;

interface DictateButtonProps {
  dictation: ChatDictation;
  voice: MotionValue<number>;
}

const DictateButton = ({ dictation, voice }: DictateButtonProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const isRecording = dictation.state === "recording";
  return (
    <Button
      aria-label={DICTATION_LABEL[dictation.state]}
      aria-pressed={isRecording}
      className="echo-chat-control echo-chat-action echo-chat-dictate shrink-0"
      disabled={dictation.state === "transcribing"}
      iconOnly
      onClick={dictation.toggle}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      size="sm"
      title={DICTATION_LABEL[dictation.state]}
      type="button"
      variant="ghost"
    >
      <RecordGlyph
        isHovered={isHovered}
        isRecording={isRecording}
        voice={voice}
      />
    </Button>
  );
};

interface MessageComposerProps {
  canSend: boolean;
  chat: ChatSession;
  menu: PromptMenu;
  placeholder: string;
  voice: MotionValue<number>;
}

export const MessageComposer = ({
  canSend,
  chat,
  menu,
  placeholder,
  voice,
}: MessageComposerProps) => {
  const { inputRef, thinkingMode } = chat;
  useEffect(() => {
    inputRef.current?.focus();
  }, [inputRef]);
  useFollowLatestText(chat.dictation.preview, inputRef);
  const highlighted = menu.isOpen ? menu.visible.at(menu.highlight) : undefined;
  const submitGlyph = (
    <GlyphSwap glyph={chat.isResponding ? "stop" : "send"}>
      {chat.isResponding ? (
        <SquareIcon aria-hidden="true" className="size-3" weight="fill" />
      ) : (
        <ArrowUpIcon aria-hidden="true" className="size-4" />
      )}
    </GlyphSwap>
  );
  return (
    <ChatComposer
      className="echo-chat-composer mt-auto shrink-0"
      density="compact"
      onSubmit={() => {
        if (canSend) {
          chat.send();
        }
      }}
      onValueChange={menu.onInput}
      state={chat.isResponding ? "submitting" : "idle"}
      value={withDictationPreview(chat.input, chat.dictation.preview)}
    >
      <ChatComposerShell>
        <ChatComposerTextarea
          aria-activedescendant={
            highlighted ? promptOptionId(highlighted.value) : undefined
          }
          aria-autocomplete="list"
          aria-controls={menu.isOpen ? PROMPT_MENU_ID : undefined}
          aria-haspopup="listbox"
          className="max-h-28 min-h-8"
          onKeyDown={menu.onKeyDown}
          placeholder={placeholder}
          readOnly={chat.dictation.state !== "idle"}
          ref={chat.inputRef}
          rows={1}
        />
        <ChatComposerToolbar>
          <ChatComposerTools>
            {thinkingMode && (
              <Toggle
                className="echo-chat-control echo-chat-think"
                onPressedChange={thinkingMode.setSelected}
                pressed={thinkingMode.selected}
                size="sm"
                variant="ghost"
              >
                <LightbulbIcon
                  aria-hidden="true"
                  weight={thinkingMode.selected ? "fill" : "regular"}
                />
                Think
              </Toggle>
            )}
          </ChatComposerTools>
          <DictateButton dictation={chat.dictation} voice={voice} />
          <ChatComposerSubmit
            aria-label="Send"
            className="echo-chat-control echo-chat-action echo-chat-send shrink-0"
            disabled={!(chat.isResponding || canSend)}
            iconOnly
            onStop={chat.stop}
            size="sm"
            stopIcon={submitGlyph}
          >
            {submitGlyph}
          </ChatComposerSubmit>
        </ChatComposerToolbar>
      </ChatComposerShell>
    </ChatComposer>
  );
};
