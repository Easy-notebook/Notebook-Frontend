import type { Extension } from '@codemirror/state';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { normalizeCodeLanguage } from '@Store/models/codeLanguage';
import { aalLanguage } from './aalLanguage';
import { aalFolding } from './aalFolding';

const syntax: Record<string, Extension[]> = {
  aal: [aalLanguage, ...aalFolding],
  python: [python()],
  javascript: [javascript()],
  typescript: [javascript({ typescript: true })],
};

/** Unknown languages remain editable plain text; they never masquerade as Python. */
export function codeLanguageExtensions(language?: string): Extension[] {
  return syntax[normalizeCodeLanguage(language)] || [];
}
