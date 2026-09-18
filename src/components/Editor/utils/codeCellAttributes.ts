import type { Cell } from '@Store/models';
import { normalizeCodeLanguage } from '@Store/models/codeLanguage';

export function decodeCodeText(value: unknown): string {
  if (typeof value !== 'string') return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Node attributes hold arrays; HTML/transaction attributes may carry encoded JSON. */
export function decodeCodeOutputs(value: unknown): Cell['outputs'] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(decodeCodeText(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function codeCellFromAttributes(attrs: Record<string, any>, id: string): Cell {
  return {
    id,
    type: attrs.originalType || 'code',
    content: decodeCodeText(attrs.code),
    outputs: decodeCodeOutputs(attrs.outputs),
    enableEdit: attrs.enableEdit !== false,
    metadata: { ...(attrs.metadata || {}), isGenerating: attrs.isGenerating === true },
    ...(attrs.originalType !== 'markdown' && { language: normalizeCodeLanguage(attrs.language) }),
  };
}
