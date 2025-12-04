/**
 * Replace @output mention placeholder in markdown string with the given transcript.
 *
 * When Plate.js serializes content with @output mentions to markdown using remarkMention,
 * the mentions appear in link format: `[output](mention:output)`
 *
 * This function handles both formats:
 * 1. Link format from remarkMention: `[output](mention:output)` or `[Output](mention:output)`
 * 2. Simple format (legacy/fallback): `@output`
 *
 * @param markdown - The markdown string that may contain @output placeholders
 * @param transcript - The transcript text to replace @output with
 * @returns The markdown string with @output replaced by the transcript
 *
 * @example
 * // With remarkMention link format
 * replaceMentionOutputInMarkdown("Here is: [output](mention:output)", "Hello World")
 * // Returns: "Here is: Hello World"
 *
 * @example
 * // With simple @output format
 * replaceMentionOutputInMarkdown("Here is: @output", "Hello World")
 * // Returns: "Here is: Hello World"
 */
export function replaceMentionOutputInMarkdown(
  markdown: string,
  transcript: string
): string {
  // Escape special replacement string characters ($ is special in String.replace)
  // $$ -> $, $& -> matched substring, $` -> preceding, $' -> following, $n -> capture group
  const safeTranscript = transcript.replace(/\$/g, "$$$$");

  // First, replace the remarkMention link format: [text](mention:output)
  // The display text can vary (e.g., "output", "Output", etc.)
  // Using a regex that matches [any text](mention:output)
  let result = markdown.replace(
    /\[([^\]]*)\]\(mention:output\)/g,
    safeTranscript
  );

  // Also replace simple @output format (legacy/fallback)
  // The regex handles @output at word boundaries to avoid replacing partial matches
  result = result.replace(/@output\b/g, safeTranscript);

  return result;
}
