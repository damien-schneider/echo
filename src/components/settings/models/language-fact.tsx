import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { MouseEvent } from "react";
import type { LanguageSupport } from "@/components/settings/models/use-polish-catalog";

type DocumentedLanguages = Exclude<LanguageSupport, { kind: "undocumented" }>;

const languageNames = new Intl.DisplayNames(["en"], { type: "language" });
const languageList = new Intl.ListFormat("en", { type: "conjunction" });

const describe = (support: DocumentedLanguages) => {
  if (support.kind === "listed") {
    return `Documented for ${languageList.format(
      support.languages.map((code) => languageNames.of(code) ?? code)
    )}`;
  }
  const count = `${support.count}${support.at_least ? "+" : ""}`;
  return `Documented for ${count} ${
    support.includes_dialects ? "languages and dialects" : "languages"
  }`;
};

const openSource = (event: MouseEvent<HTMLAnchorElement>) => {
  event.preventDefault();
  openUrl(event.currentTarget.href).catch((error: unknown) =>
    console.error("Failed to open language documentation:", error)
  );
};

export const LanguageFact = ({ support }: { support: LanguageSupport }) => {
  if (support.kind === "undocumented") {
    return "Languages not documented";
  }
  return (
    <a
      className="inline-flex items-center gap-0.5 underline decoration-current/40 underline-offset-2 hover:text-foreground hover:decoration-current"
      href={support.source}
      onClick={openSource}
      rel="noopener noreferrer"
      target="_blank"
      title="Open the developer's language documentation"
    >
      {describe(support)}
      <ArrowSquareOutIcon aria-hidden="true" className="size-3" />
    </a>
  );
};
