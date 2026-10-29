import { EditorState } from '@codemirror/state';
import { indentUnit } from '@codemirror/language';
import '../../../Editor/Cells/CodeCell/components/CodeEditor.css';
import { useEffect, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { z } from 'zod';
import { useTheme } from '@/contexts/ThemeContext';
import { NativeNotebookTransport } from '@Services/notebook/NativeNotebookTransport';
import { codeLanguageExtensions } from '../../../Editor/Cells/CodeCell/utils/languageSupport';
const sourceSchema = z.object({
  className: z.string(),
  source: z.string(),
  startLine: z.number().int().positive(),
  origin: z.string(),
});
type Source = z.infer<typeof sourceSchema>;
export function AgentSource({ notebookId, className }: { notebookId: string; className: string }) {
  const [state, setState] = useState<{ source?: Source; error?: string }>({});
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    const controller = new AbortController();
    const read = async () => {
      try {
        const source = sourceSchema.parse(
          await new NativeNotebookTransport(notebookId).send(
            `agents/${encodeURIComponent(className)}/source`,
            undefined,
            controller.signal
          )
        );
        if (source.className !== className) throw new Error('Agent source identity mismatch');
        if (!controller.signal.aborted) setState({ source });
      } catch (error) {
        if (!controller.signal.aborted) setState({ error: String(error) });
      }
    };
    void read();
    return () => controller.abort();
  }, [notebookId, className]);
  if (state.error) return <p role="alert">{state.error}</p>;
  if (!state.source) return <p role="status">读取 AAL 源码…</p>;
  return (
    <section aria-label={`${className} AAL 源码`}>
      <p className="wa-caption">
        {state.source.origin} · 第 {state.source.startLine} 行起 · 只读
      </p>
      <CodeMirror
        className="notebook-code-editor wa-source-editor"
        value={state.source.source}
        readOnly
        editable={false}
        theme={resolvedTheme}
        extensions={[
          ...codeLanguageExtensions('aal'),
          EditorState.tabSize.of(2),
          indentUnit.of('  '),
        ]}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
        }}
      />
    </section>
  );
}
