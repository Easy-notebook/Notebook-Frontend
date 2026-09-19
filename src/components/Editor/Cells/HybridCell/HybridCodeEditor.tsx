import CodeMirror from '@uiw/react-codemirror';
import { dracula } from '@uiw/codemirror-theme-dracula';
import { useTheme } from '@/contexts/ThemeContext';
import { useEditorReadOnly } from '../../EditorAccessContext';
import { useCodeEditorActivation } from '../CodeCell/model/useCodeEditorActivation';
import { codeLanguageExtensions } from '../CodeCell/utils/languageSupport';

export function HybridCodeEditor({
  cellId,
  content,
  language,
  current,
  onChange,
}: {
  cellId: string;
  content: string;
  language?: string;
  current: boolean;
  onChange: (value: string) => void;
}) {
  const { resolvedTheme } = useTheme();
  const readOnly = useEditorReadOnly();
  const activation = useCodeEditorActivation(cellId, current);
  return (
    <div
      ref={activation.container}
      onBlurCapture={activation.onInputSettled}
      onCompositionEndCapture={activation.onInputSettled}
    >
      {activation.active ? (
        <CodeMirror
          value={content}
          height="auto"
          className="text-base"
          initialState={activation.initialState(content)}
          onCreateEditor={activation.onCreateEditor}
          onUpdate={activation.onUpdate}
          extensions={codeLanguageExtensions(language)}
          readOnly={readOnly}
          onChange={readOnly ? undefined : onChange}
          theme={resolvedTheme === 'dark' ? dracula : 'light'}
        />
      ) : (
        <pre
          className="m-0 px-3 py-1 font-mono whitespace-pre overflow-hidden"
          style={{
            minHeight: activation.placeholderHeight ?? 32,
            height: activation.placeholderHeight,
          }}
          tabIndex={0}
          aria-label="Code preview; focus to activate editor"
          onFocus={activation.activate}
          onPointerDown={activation.activate}
        >
          {content || ' '}
        </pre>
      )}
    </div>
  );
}
