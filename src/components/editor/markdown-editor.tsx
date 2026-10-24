import { InputGroup } from "@ctrl-ui/react/ui/input-group";
import { Plate, PlateContent } from "platejs/react";
import { EditorToolbar } from "./toolbar";
import { useMarkdownEditor } from "./use-markdown-editor";
import "./editor.css";

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
    <InputGroup className="h-auto flex-col items-stretch [--cui-field-padding-inline:0px]">
      <Plate editor={editor} onChange={handleChange}>
        <div className="px-1.5 pt-1.5">
          <EditorToolbar />
        </div>
        <PlateContent
          aria-labelledby={labelledBy}
          className="w-full px-3 py-2 **:selection:bg-blue-500/35! focus:outline-none **:data-slate-placeholder:text-muted-foreground **:data-slate-placeholder:opacity-100 dark:**:selection:bg-blue-400/45!"
          placeholder={placeholder}
        />
      </Plate>
    </InputGroup>
  );
}
