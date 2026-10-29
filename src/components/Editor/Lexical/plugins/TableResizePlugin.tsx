import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { TableColumnResizeController } from '../interaction/TableColumnResizeController';

export function TableResizePlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => new TableColumnResizeController(editor).attach(), [editor]);
  return null;
}
