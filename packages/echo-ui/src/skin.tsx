import type { ControlUiSkin } from "@ctrl-ui/react/skin";
import { SkinProvider } from "@ctrl-ui/react/skin-provider";
import type { ReactNode } from "react";

export const echoSkin = {
  id: "echo",
  scrollAreaScrollbarGutter: "stable",
} satisfies ControlUiSkin;

export function EchoSkin({ children }: { children: ReactNode }) {
  return <SkinProvider skin={echoSkin}>{children}</SkinProvider>;
}
