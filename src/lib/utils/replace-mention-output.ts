const TRANSCRIPT_PLACEHOLDER =
  /\[[^\]]*\]\(mention:output\)|\$\{output\}|@output\b/g;

export function replaceMentionOutputInMarkdown(
  markdown: string,
  transcript: string
): string {
  return markdown.replace(TRANSCRIPT_PLACEHOLDER, () => transcript);
}
