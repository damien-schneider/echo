// Handles remarkMention link format `[text](mention:output)` and legacy `@output`.
export function replaceMentionOutputInMarkdown(
  markdown: string,
  transcript: string
): string {
  // Escape $ — String.replace treats $$/$&/$`/$'/$n specially.
  const safeTranscript = transcript.replace(/\$/g, "$$$$");

  let result = markdown.replace(
    /\[([^\]]*)\]\(mention:output\)/g,
    safeTranscript
  );

  // Legacy/fallback @output — word boundary to avoid partial match.
  result = result.replace(/@output\b/g, safeTranscript);

  return result;
}
