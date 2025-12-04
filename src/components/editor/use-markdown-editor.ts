"use client";

import {
  BlockquotePlugin,
  BoldPlugin,
  CodePlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  H4Plugin,
  H5Plugin,
  H6Plugin,
  ItalicPlugin,
  StrikethroughPlugin,
  UnderlinePlugin,
} from "@platejs/basic-nodes/react";
import {
  CodeBlockPlugin,
  CodeLinePlugin,
  CodeSyntaxPlugin,
} from "@platejs/code-block/react";
import {
  BulletedListPlugin,
  ListItemPlugin,
  ListPlugin,
  NumberedListPlugin,
  TaskListPlugin,
} from "@platejs/list-classic/react";
import { MarkdownPlugin, remarkMdx, remarkMention } from "@platejs/markdown";
import { MentionInputPlugin, MentionPlugin } from "@platejs/mention/react";
import type { Value } from "platejs";
import { usePlateEditor } from "platejs/react";
import { useEffect, useRef } from "react";
import remarkGfm from "remark-gfm";

import { MentionElement, MentionInputElement } from "./mention-node";

// Pre-compiled regex pattern at top level for performance
const MENTION_TRIGGER_PATTERN = /^$|^[\s"']$/;

// Static plugins array for non-mention editors
const BASE_PLUGINS = [
  // Basic marks
  BoldPlugin,
  ItalicPlugin,
  UnderlinePlugin,
  StrikethroughPlugin,
  CodePlugin,

  // Basic elements
  H1Plugin,
  H2Plugin,
  H3Plugin,
  H4Plugin,
  H5Plugin,
  H6Plugin,
  BlockquotePlugin,

  // Code blocks
  CodeBlockPlugin,
  CodeLinePlugin,
  CodeSyntaxPlugin,

  // Lists
  ListPlugin,
  BulletedListPlugin,
  NumberedListPlugin,
  ListItemPlugin,
  TaskListPlugin,

  // Markdown plugin with GFM and MDX support (for HTML-like tags)
  MarkdownPlugin.configure({
    options: {
      remarkPlugins: [remarkGfm, remarkMdx],
    },
  }),
];

// Static plugins array for mention-enabled editors
const MENTION_PLUGINS = [
  // Basic marks
  BoldPlugin,
  ItalicPlugin,
  UnderlinePlugin,
  StrikethroughPlugin,
  CodePlugin,

  // Basic elements
  H1Plugin,
  H2Plugin,
  H3Plugin,
  H4Plugin,
  H5Plugin,
  H6Plugin,
  BlockquotePlugin,

  // Code blocks
  CodeBlockPlugin,
  CodeLinePlugin,
  CodeSyntaxPlugin,

  // Lists
  ListPlugin,
  BulletedListPlugin,
  NumberedListPlugin,
  ListItemPlugin,
  TaskListPlugin,

  // Markdown plugin with GFM, MDX, and mention support
  MarkdownPlugin.configure({
    options: {
      remarkPlugins: [remarkGfm, remarkMdx, remarkMention],
    },
  }),

  // Mention plugins with UI components
  MentionPlugin.configure({
    options: {
      trigger: "@",
      triggerPreviousCharPattern: MENTION_TRIGGER_PATTERN,
      insertSpaceAfterMention: false,
    },
  }).withComponent(MentionElement),
  MentionInputPlugin.withComponent(MentionInputElement),
];

type UseMarkdownEditorOptions = {
  content?: string;
  onUpdate?: (markdown: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  editable?: boolean;
  enableMentions?: boolean;
};

export function useMarkdownEditor({
  content = "",
  onUpdate,
  autoFocus = false,
  editable = true,
  enableMentions = false,
}: UseMarkdownEditorOptions) {
  // Track whether this is the initial mount
  const isInitialMount = useRef(true);
  // Track the last content we set to avoid sync loops
  const lastSetContent = useRef(content);
  // Store the onUpdate callback in a ref to avoid recreating handleChange
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  // Use stable plugin arrays
  const plugins = enableMentions ? MENTION_PLUGINS : BASE_PLUGINS;

  // Initial value computation - intentionally only on mount
  const initialValue = (() => {
    if (content) {
      // We can't deserialize here without editor, so return a placeholder
      // The actual deserialization happens in the value factory
      return content;
    }
    return "";
  })();

  const editor = usePlateEditor(
    {
      plugins,
      value: (plateEditor) => {
        if (initialValue) {
          const markdownApi = plateEditor.getApi(MarkdownPlugin).markdown;
          return markdownApi.deserialize(initialValue) as Value;
        }
        return [{ type: "p", children: [{ text: "" }] }] as Value;
      },
    },
    [enableMentions]
  );

  // Handle onChange callback - use ref to avoid dependency on onUpdate
  const handleChange = () => {
    if (editor && onUpdateRef.current) {
      const markdownApi = editor.getApi(MarkdownPlugin).markdown;
      const markdown = markdownApi.serialize();
      // Update our tracking ref so we don't try to sync this back
      lastSetContent.current = markdown;
      onUpdateRef.current(markdown);
    }
  };

  // Sync editor content when the external value changes (e.g., from parent reset)
  useEffect(() => {
    // Skip on initial mount - the editor already has the initial value
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (!editor) {
      return;
    }

    // Skip if this content came from our own onChange (avoid sync loop)
    if (lastSetContent.current === content) {
      return;
    }

    // Update tracking ref
    lastSetContent.current = content;

    // Deserialize and set the new content
    const markdownApi = editor.getApi(MarkdownPlugin).markdown;
    const value = content
      ? (markdownApi.deserialize(content) as Value)
      : ([{ type: "p", children: [{ text: "" }] }] as Value);

    editor.tf.setValue(value);
  }, [editor, content]);

  return { editor, handleChange, autoFocus, editable };
}
