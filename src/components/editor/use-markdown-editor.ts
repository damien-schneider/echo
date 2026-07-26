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

const MENTION_TRIGGER_PATTERN = /^$|^[\s"']$/;

const BASE_PLUGINS = [
  BoldPlugin,
  ItalicPlugin,
  UnderlinePlugin,
  StrikethroughPlugin,
  CodePlugin,

  H1Plugin,
  H2Plugin,
  H3Plugin,
  H4Plugin,
  H5Plugin,
  H6Plugin,
  BlockquotePlugin,

  CodeBlockPlugin,
  CodeLinePlugin,
  CodeSyntaxPlugin,

  ListPlugin,
  BulletedListPlugin,
  NumberedListPlugin,
  ListItemPlugin,
  TaskListPlugin,

  MarkdownPlugin.configure({
    options: {
      remarkPlugins: [remarkGfm, remarkMdx],
    },
  }),
];

const MENTION_PLUGINS = [
  BoldPlugin,
  ItalicPlugin,
  UnderlinePlugin,
  StrikethroughPlugin,
  CodePlugin,

  H1Plugin,
  H2Plugin,
  H3Plugin,
  H4Plugin,
  H5Plugin,
  H6Plugin,
  BlockquotePlugin,

  CodeBlockPlugin,
  CodeLinePlugin,
  CodeSyntaxPlugin,

  ListPlugin,
  BulletedListPlugin,
  NumberedListPlugin,
  ListItemPlugin,
  TaskListPlugin,

  MarkdownPlugin.configure({
    options: {
      remarkPlugins: [remarkGfm, remarkMdx, remarkMention],
    },
  }),

  MentionPlugin.configure({
    options: {
      insertSpaceAfterMention: false,
      trigger: "@",
      triggerPreviousCharPattern: MENTION_TRIGGER_PATTERN,
    },
  }).withComponent(MentionElement),
  MentionInputPlugin.withComponent(MentionInputElement),
];

interface UseMarkdownEditorOptions {
  autoFocus?: boolean;
  content?: string;
  editable?: boolean;
  enableMentions?: boolean;
  onUpdate?: (markdown: string) => void;
  placeholder?: string;
}

export function useMarkdownEditor({
  content = "",
  onUpdate,
  autoFocus = false,
  editable = true,
  enableMentions = false,
}: UseMarkdownEditorOptions) {
  const isInitialMount = useRef(true);
  // Track last content set to avoid sync loops.
  const lastSetContent = useRef(content);
  // Ref onUpdate so handleChange identity stays stable.
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const plugins = enableMentions ? MENTION_PLUGINS : BASE_PLUGINS;

  // Mount-only; deserialization happens in value factory.
  const initialValue = (() => {
    if (content) {
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
        return [{ children: [{ text: "" }], type: "p" }] as Value;
      },
    },
    [enableMentions]
  );

  const handleChange = () => {
    if (editor && onUpdateRef.current) {
      const markdownApi = editor.getApi(MarkdownPlugin).markdown;
      const markdown = markdownApi.serialize();
      lastSetContent.current = markdown;
      onUpdateRef.current(markdown);
    }
  };

  // Sync editor when external content changes (parent reset).
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (!editor) {
      return;
    }

    // Skip self-emitted content to avoid sync loop.
    if (lastSetContent.current === content) {
      return;
    }

    lastSetContent.current = content;

    const markdownApi = editor.getApi(MarkdownPlugin).markdown;
    const value = content
      ? (markdownApi.deserialize(content) as Value)
      : ([{ children: [{ text: "" }], type: "p" }] as Value);

    editor.tf.setValue(value);
  }, [editor, content]);

  return { autoFocus, editable, editor, handleChange };
}
