import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import { postProcessWithTools } from "@/lib/ai-tools";

interface PostProcessRequest {
  transcription: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  requestId: string;
}

/**
 * Provider component that listens for post-process requests from the Rust backend
 * and handles them using the AI SDK with tool support.
 */
export const AiSdkPostProcessProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const unlistenRef = useRef<UnlistenFn | null>(null);

  useEffect(() => {
    const setupListener = async () => {
      // Listen for post-process requests from the backend
      unlistenRef.current = await listen<PostProcessRequest>(
        "post-process-request",
        async (event) => {
          const request = event.payload;
          console.log(
            "[AiSdkPostProcess] Received post-process request:",
            request.requestId
          );

          try {
            const result = await postProcessWithTools({
              baseUrl: request.baseUrl,
              apiKey: request.apiKey,
              model: request.model,
              prompt: request.prompt,
              transcription: request.transcription,
            });

            console.log("[AiSdkPostProcess] Processing result:", {
              success: result.success,
              hasToolResults: !!result.toolResults?.length,
              textLength: result.text.length,
            });

            // Log tool results if any
            if (result.toolResults && result.toolResults.length > 0) {
              console.log("[AiSdkPostProcess] Tool results:", result.toolResults);
            }

            // Paste the result text using Tauri command
            await invoke("paste_text_and_hide_overlay", {
              text: result.text,
            });

            console.log("[AiSdkPostProcess] Pasted result and hid overlay");
          } catch (error) {
            console.error("[AiSdkPostProcess] Error processing request:", error);

            // Fall back to pasting the original transcription
            try {
              await invoke("paste_text_and_hide_overlay", {
                text: request.transcription,
              });
            } catch (pasteError) {
              console.error(
                "[AiSdkPostProcess] Failed to paste fallback text:",
                pasteError
              );
              // At least try to hide the overlay
              try {
                await invoke("hide_overlay_and_reset_tray");
              } catch {
                // Silently fail
              }
            }
          }
        }
      );
    };

    setupListener();

    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
      }
    };
  }, []);

  return <>{children}</>;
};

