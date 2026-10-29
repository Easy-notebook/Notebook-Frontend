import { FrameTask } from '../interaction/FrameTask';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEditorReadOnly } from '../../EditorAccessContext';
import { TableToolbarActions } from './TableToolbarActions';
import { useTableToolbar } from './useTableToolbar';
import './table-toolbar.css';

export function TableToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const readOnly = useEditorReadOnly();
  const { controller, state } = useTableToolbar(editor);
  const surface = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(
    null
  );
  const tableKey = state?.tableKey;
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!tableKey || readOnly) {
      setPosition(null);
      return;
    }
    const element = editor.getElementByKey(tableKey);
    if (!element) return;
    const table = element.matches('table') ? element : (element.querySelector('table') ?? element);
    const update = () => {
      const rect = table.getBoundingClientRect();
      const next =
        rect.bottom > 36 && rect.top >= 36 && rect.top < window.innerHeight
          ? { left: rect.left, top: rect.top - 36, width: rect.width }
          : null;
      setPosition((current) =>
        current?.left === next?.left && current?.top === next?.top && current?.width === next?.width
          ? current
          : next
      );
    };
    const focus = (event: Event) => {
      const target = event.target as Node;
      setFocused(
        !!editor.getRootElement()?.contains(target) || !!surface.current?.contains(target)
      );
    };
    setFocused(!!editor.getRootElement()?.contains(document.activeElement));
    const layout = new FrameTask(update);
    const observer = new ResizeObserver(layout.schedule);
    observer.observe(table);
    const root = editor.getRootElement();
    if (root) observer.observe(root);
    update();
    window.addEventListener('scroll', layout.schedule, true);
    window.addEventListener('resize', layout.schedule);
    document.addEventListener('pointerdown', focus, true);
    document.addEventListener('focusin', focus);
    return () => {
      layout.cancel();
      observer.disconnect();
      window.removeEventListener('scroll', layout.schedule, true);
      window.removeEventListener('resize', layout.schedule);
      document.removeEventListener('pointerdown', focus, true);
      document.removeEventListener('focusin', focus);
    };
  }, [editor, tableKey, readOnly]);
  if (!state || !controller || !position || !focused || readOnly) return null;
  return createPortal(
    <div
      ref={surface}
      role="toolbar"
      aria-label="Table toolbar"
      className="notebook-table-topbar"
      style={position}
      onMouseDown={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setFocused(false);
          editor.focus();
        }
      }}
    >
      <TableToolbarActions controller={controller} state={state} />
    </div>,
    document.body
  );
}
