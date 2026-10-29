import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { registerWritingInput } from './WritingInput';
export function WritingInputPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => registerWritingInput(editor), [editor]);
  return null;
}
