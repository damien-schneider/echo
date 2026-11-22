import { MicrophoneIcon } from "@phosphor-icons/react";
import type { MotionValue } from "motion/react";
import { GlyphSwap } from "@/features/overlay-controls/glyph/glyph-swap";
import { FinishMark } from "@/features/overlay-notification/finish-mark/finish-mark";

interface RecordGlyphProps {
  isHovered: boolean;
  isRecording: boolean;
  voice: MotionValue<number>;
}

export const RecordGlyph = ({
  isHovered,
  isRecording,
  voice,
}: RecordGlyphProps) => (
  <GlyphSwap glyph={isRecording ? "voice" : "microphone"}>
    {isRecording ? (
      <FinishMark
        hasText={false}
        isHovered={isHovered}
        isLoading={false}
        voice={voice}
      />
    ) : (
      <MicrophoneIcon aria-hidden="true" />
    )}
  </GlyphSwap>
);
