import { z } from "zod";
import { isDisplayableProgress } from "@/features/overlay-controls/recording-overlay-state";

export const TranscriptionProgressSchema = z
  .string()
  .refine(isDisplayableProgress);

export const ModelDownloadTerminalSchema = z
  .string()
  .refine(isDisplayableProgress);
