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
import { MarkdownPlugin } from "@platejs/markdown";
import type { SlateEditor, Value } from "platejs";
import { usePlateEditor } from "platejs/react";
import { useEffect, useRef, useState } from "react";
import remarkGfm from "remark-gfm";

const PROMPT_PLUGINS = [
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
      remarkPlugins: [remarkGfm],
    },
  }),
];

const emptyValue = (): Value => [{ children: [{ text: "" }], type: "p" }];

const deserializePrompt = (editor: SlateEditor, markdown: string): Value => {
  if (!markdown) {
    return emptyValue();
  }
  return editor.getApi(MarkdownPlugin).markdown.deserialize(markdown);
};

const serializePrompt = (editor: SlateEditor, value?: Value): string =>
  editor
    .getApi(MarkdownPlugin)
    .markdown.serialize({ preserveEmptyParagraphs: false, value });

interface LoadedPrompt {
  content: string;
  markdown: string;
}

export function useMarkdownEditor({
  content,
  onUpdate,
}: {
  content: string;
  onUpdate: (markdown: string) => void;
}) {
  const lastEmittedContent = useRef(content);
  const editor = usePlateEditor({
    plugins: PROMPT_PLUGINS,
    value: (plateEditor) => deserializePrompt(plateEditor, content),
  });
  const [initialPrompt] = useState<LoadedPrompt>(() => ({
    content,
    markdown: serializePrompt(editor),
  }));
  const loadedPrompt = useRef(initialPrompt);

  const handleChange = () => {
    const markdown = serializePrompt(editor);
    const promptText =
      markdown === loadedPrompt.current.markdown
        ? loadedPrompt.current.content
        : markdown;
    lastEmittedContent.current = promptText;
    onUpdate(promptText);
  };

  useEffect(() => {
    if (lastEmittedContent.current === content) {
      return;
    }
    const value = deserializePrompt(editor, content);
    loadedPrompt.current = {
      content,
      markdown: serializePrompt(editor, value),
    };
    lastEmittedContent.current = content;
    editor.tf.setValue(value);
  }, [editor, content]);

  return { editor, handleChange };
}
