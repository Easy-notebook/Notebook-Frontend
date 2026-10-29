import { useEffect, useState } from 'react';
import type { LexicalEditor } from 'lexical';

/** Portals follow the editor root lifecycle, including initial mount and root replacement. */
export function useEditorSurface(editor: LexicalEditor) {
  const [root, setRoot] = useState<HTMLElement | null>(() => editor.getRootElement());
  useEffect(() => editor.registerRootListener(setRoot), [editor]);
  return root?.closest<HTMLElement>('.notebook-editor-container') ?? null;
}
