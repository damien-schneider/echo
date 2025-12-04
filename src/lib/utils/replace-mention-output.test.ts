import { describe, expect, it } from "bun:test";
import { replaceMentionOutputInMarkdown } from "./replace-mention-output";

describe("replaceMentionOutputInMarkdown", () => {
  describe("remarkMention link format [text](mention:output)", () => {
    it("should replace [output](mention:output) with transcript", () => {
      const markdown = "Here is the output: [output](mention:output)";
      const result = replaceMentionOutputInMarkdown(markdown, "Hello World");
      expect(result).toBe("Here is the output: Hello World");
    });

    it("should replace [Output](mention:output) with different case display text", () => {
      const markdown = "Here is: [Output](mention:output)";
      const result = replaceMentionOutputInMarkdown(
        markdown,
        "transcript text"
      );
      expect(result).toBe("Here is: transcript text");
    });

    it("should replace multiple [output](mention:output) occurrences", () => {
      const markdown =
        "First: [output](mention:output), Second: [output](mention:output)";
      const result = replaceMentionOutputInMarkdown(markdown, "text");
      expect(result).toBe("First: text, Second: text");
    });

    it("should handle [output](mention:output) at start of string", () => {
      const markdown = "[output](mention:output) is at the start";
      const result = replaceMentionOutputInMarkdown(markdown, "Transcript");
      expect(result).toBe("Transcript is at the start");
    });

    it("should handle [output](mention:output) at end of string", () => {
      const markdown = "Ends with [output](mention:output)";
      const result = replaceMentionOutputInMarkdown(markdown, "transcript");
      expect(result).toBe("Ends with transcript");
    });

    it("should handle [output](mention:output) as only content", () => {
      const markdown = "[output](mention:output)";
      const result = replaceMentionOutputInMarkdown(markdown, "entire content");
      expect(result).toBe("entire content");
    });

    it("should not replace other mention types like [user](mention:user)", () => {
      const markdown =
        "Hello [Alice](mention:alice)! Output: [output](mention:output)";
      const result = replaceMentionOutputInMarkdown(markdown, "transcript");
      expect(result).toBe("Hello [Alice](mention:alice)! Output: transcript");
    });

    it("should handle empty display text [](mention:output)", () => {
      const markdown = "Empty: [](mention:output)";
      const result = replaceMentionOutputInMarkdown(markdown, "filled");
      expect(result).toBe("Empty: filled");
    });

    it("should handle display text with spaces [my output](mention:output)", () => {
      const markdown = "Custom: [my output text](mention:output)";
      const result = replaceMentionOutputInMarkdown(markdown, "replaced");
      expect(result).toBe("Custom: replaced");
    });
  });

  describe("legacy @output format", () => {
    it("should replace @output in simple text", () => {
      const markdown = "Here is the output: @output";
      const result = replaceMentionOutputInMarkdown(markdown, "Hello World");
      expect(result).toBe("Here is the output: Hello World");
    });

    it("should replace multiple @output occurrences", () => {
      const markdown = "First: @output, Second: @output";
      const result = replaceMentionOutputInMarkdown(markdown, "text");
      expect(result).toBe("First: text, Second: text");
    });

    it("should handle @output at start of string", () => {
      const markdown = "@output is at the start";
      const result = replaceMentionOutputInMarkdown(markdown, "Transcript");
      expect(result).toBe("Transcript is at the start");
    });

    it("should handle @output at end of string", () => {
      const markdown = "Ends with @output";
      const result = replaceMentionOutputInMarkdown(markdown, "transcript");
      expect(result).toBe("Ends with transcript");
    });

    it("should not replace @outputter (word boundary)", () => {
      const markdown = "@outputter is not replaced but @output is";
      const result = replaceMentionOutputInMarkdown(markdown, "X");
      expect(result).toBe("@outputter is not replaced but X is");
    });

    it("should replace @output followed by punctuation", () => {
      const markdown = "Check @output. Also @output! And @output?";
      const result = replaceMentionOutputInMarkdown(markdown, "X");
      expect(result).toBe("Check X. Also X! And X?");
    });

    it("should replace @output followed by newline", () => {
      const markdown = "@output\nnew line";
      const result = replaceMentionOutputInMarkdown(markdown, "first");
      expect(result).toBe("first\nnew line");
    });
  });

  describe("mixed formats", () => {
    it("should handle both link format and @output format in same string", () => {
      const markdown = "Link: [output](mention:output) and legacy: @output";
      const result = replaceMentionOutputInMarkdown(markdown, "REPLACED");
      expect(result).toBe("Link: REPLACED and legacy: REPLACED");
    });
  });

  describe("edge cases", () => {
    it("should return unchanged string when no @output present", () => {
      const markdown = "No mentions here";
      const result = replaceMentionOutputInMarkdown(markdown, "transcript");
      expect(result).toBe("No mentions here");
    });

    it("should handle empty string", () => {
      const result = replaceMentionOutputInMarkdown("", "transcript");
      expect(result).toBe("");
    });

    it("should handle empty transcript", () => {
      const markdown = "Before [output](mention:output) after";
      const result = replaceMentionOutputInMarkdown(markdown, "");
      expect(result).toBe("Before  after");
    });

    it("should handle transcript with special regex characters", () => {
      const markdown = "Output: [output](mention:output)";
      // These characters are special in regex replacement: $ is special
      const result = replaceMentionOutputInMarkdown(markdown, "Cost: $100");
      expect(result).toBe("Output: Cost: $100");
    });

    it("should handle transcript with markdown syntax", () => {
      const markdown = "Result: [output](mention:output)";
      const result = replaceMentionOutputInMarkdown(
        markdown,
        "**bold** and *italic*"
      );
      expect(result).toBe("Result: **bold** and *italic*");
    });

    it("should handle multiline transcript", () => {
      const markdown = "Output: [output](mention:output)";
      const result = replaceMentionOutputInMarkdown(
        markdown,
        "Line 1\nLine 2\nLine 3"
      );
      expect(result).toBe("Output: Line 1\nLine 2\nLine 3");
    });
  });

  describe("markdown formatting preservation", () => {
    it("should preserve markdown formatting around mentions", () => {
      const markdown =
        "**Bold**: [output](mention:output)\n\n*Italic*: [output](mention:output)";
      const result = replaceMentionOutputInMarkdown(markdown, "text");
      expect(result).toBe("**Bold**: text\n\n*Italic*: text");
    });

    it("should work inside code blocks (though unusual usage)", () => {
      const markdown = "```\n[output](mention:output)\n```";
      const result = replaceMentionOutputInMarkdown(markdown, "code");
      expect(result).toBe("```\ncode\n```");
    });

    it("should work in lists", () => {
      const markdown =
        "- Item 1: [output](mention:output)\n- Item 2: [output](mention:output)";
      const result = replaceMentionOutputInMarkdown(markdown, "value");
      expect(result).toBe("- Item 1: value\n- Item 2: value");
    });

    it("should work in blockquotes", () => {
      const markdown = "> Quote: [output](mention:output)";
      const result = replaceMentionOutputInMarkdown(markdown, "quoted text");
      expect(result).toBe("> Quote: quoted text");
    });

    it("should work in headings", () => {
      const markdown = "# Title: [output](mention:output)";
      const result = replaceMentionOutputInMarkdown(markdown, "My Heading");
      expect(result).toBe("# Title: My Heading");
    });
  });

  describe("real-world scenarios", () => {
    it("should handle a template for meeting notes", () => {
      const markdown = `# Meeting Notes

**Date:** 2024-01-15

## Transcription

[output](mention:output)

## Action Items

- Follow up on discussion points`;

      const transcript =
        "We discussed the quarterly targets and agreed to increase marketing budget by 15%.";

      const result = replaceMentionOutputInMarkdown(markdown, transcript);

      expect(result).toBe(`# Meeting Notes

**Date:** 2024-01-15

## Transcription

${transcript}

## Action Items

- Follow up on discussion points`);
    });

    it("should handle template with AI processing instructions", () => {
      const markdown = `Please summarize the following:

[output](mention:output)

Provide bullet points.`;

      const transcript =
        "The user talked about their project requirements including authentication, API design, and database schema.";

      const result = replaceMentionOutputInMarkdown(markdown, transcript);

      expect(result).toBe(`Please summarize the following:

${transcript}

Provide bullet points.`);
    });

    it("should handle inline usage", () => {
      const markdown =
        'The user said: "[output](mention:output)" - please analyze this.';
      const result = replaceMentionOutputInMarkdown(markdown, "Hello world");
      expect(result).toBe(
        'The user said: "Hello world" - please analyze this.'
      );
    });
  });

  describe("not matching similar patterns", () => {
    it("should not replace normal markdown links", () => {
      const markdown = "Check [this link](https://example.com)";
      const result = replaceMentionOutputInMarkdown(markdown, "wrong");
      expect(result).toBe("Check [this link](https://example.com)");
    });

    it("should not replace mention links with different ids", () => {
      const markdown = "[user](mention:user123) said [output](mention:output)";
      const result = replaceMentionOutputInMarkdown(markdown, "text");
      expect(result).toBe("[user](mention:user123) said text");
    });

    it("should not replace (mention:output) without square brackets", () => {
      const markdown = "Just (mention:output) without brackets";
      const result = replaceMentionOutputInMarkdown(markdown, "wrong");
      expect(result).toBe("Just (mention:output) without brackets");
    });

    it("should not replace mention:output in plain text", () => {
      const markdown = "The syntax is mention:output for mentions";
      const result = replaceMentionOutputInMarkdown(markdown, "wrong");
      expect(result).toBe("The syntax is mention:output for mentions");
    });
  });
});
