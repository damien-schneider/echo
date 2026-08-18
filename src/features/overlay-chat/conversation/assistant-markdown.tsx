import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { openUrl } from "@tauri-apps/plugin-opener";
import { type ComponentProps, type RefObject, useEffect, useRef } from "react";
import { type ExtraProps, Streamdown, type ThemeInput } from "streamdown";
import "streamdown/styles.css";

const clickedLink = (event: MouseEvent): HTMLAnchorElement | null => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return null;
  }
  const anchor = target.closest("a");
  return anchor instanceof HTMLAnchorElement && anchor.href ? anchor : null;
};

const useBrowserHandoff = (): RefObject<HTMLDivElement | null> => {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const handoff = async (event: MouseEvent) => {
      const link = clickedLink(event);
      if (link) {
        event.preventDefault();
        await openUrl(link.href);
      }
    };
    root.addEventListener("click", handoff);
    return () => root.removeEventListener("click", handoff);
  }, []);
  return rootRef;
};

/// Streamdown renders links as buttons calling window.open; the overlay webview opens neither.
const BrowserLink = ({ node, ...props }: ComponentProps<"a"> & ExtraProps) => (
  <a
    {...props}
    className="underline decoration-current/40 underline-offset-2 hover:decoration-current"
    rel="noopener noreferrer"
    target="_blank"
  />
);

const MARKDOWN_COMPONENTS = { a: BrowserLink };
const MARKDOWN_PLUGINS = { cjk, code };
const SHIKI_THEME = ["github-light", "github-dark"] satisfies [
  ThemeInput,
  ThemeInput,
];

/// Fullscreen and download controls have nowhere to go inside a floating panel.
const MARKDOWN_CONTROLS = {
  code: { copy: true, download: false },
  mermaid: false,
  table: { copy: true, download: false, fullscreen: false },
};

interface AssistantMarkdownProps {
  isStreaming: boolean;
  text: string;
}

export const AssistantMarkdown = ({
  isStreaming,
  text,
}: AssistantMarkdownProps) => {
  const rootRef = useBrowserHandoff();
  return (
    <div
      className="dark cursor-text select-text"
      data-component="chat-message-text"
      ref={rootRef}
    >
      <Streamdown
        caret="block"
        className="echo-chat-markdown"
        components={MARKDOWN_COMPONENTS}
        controls={MARKDOWN_CONTROLS}
        isAnimating={isStreaming}
        lineNumbers={false}
        mode="streaming"
        plugins={MARKDOWN_PLUGINS}
        shikiTheme={SHIKI_THEME}
      >
        {text}
      </Streamdown>
    </div>
  );
};
