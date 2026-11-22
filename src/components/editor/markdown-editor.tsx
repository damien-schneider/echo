import { InputGroup } from "@ctrl-ui/react/ui/input-group";
import { Plate, PlateContent } from "platejs/react";
import { EditorToolbar } from "@/components/editor/toolbar";
import { useMarkdownEditor } from "@/components/editor/use-markdown-editor";
import "@/components/editor/editor.css";

interface MarkdownEditorProps {
  labelledBy: string;
  onChange: (markdown: string) => void;
  placeholder: string;
  value: string;
}

export function MarkdownEditor({
  labelledBy,
  onChange,
  placeholder,
  value,
}: MarkdownEditorProps) {
  const { editor, handleChange } = useMarkdownEditor({
    content: value,
    onUpdate: onChange,
  });

  return (
    <InputGroup className="markdown-editor h-auto flex-col items-stretch">
      <Plate editor={editor} onChange={handleChange}>
        <EditorToolbar />
        <PlateContent
          aria-labelledby={labelledBy}
          className="w-full px-3 py-2 **:selection:bg-blue-500/35! focus:outline-none **:data-slate-placeholder:text-muted-foreground **:data-slate-placeholder:opacity-100 dark:**:selection:bg-blue-400/45!"
          placeholder={placeholder}
        />
      </Plate>
    </InputGroup>
  );
}
