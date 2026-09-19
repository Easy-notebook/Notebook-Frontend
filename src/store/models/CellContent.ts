import type { Cell, CellType } from './cell';
import { formatCodeFence, standaloneFence } from '@Utils/markdown/fencedMarkdown';
import { normalizeCodeLanguage } from './codeLanguage';

/** Text representation only; conversion never reads outputs or business metadata. */
export class CellContent {
  type: CellType;
  content: string;
  language?: string;

  constructor(value: Pick<Cell, 'type' | 'content' | 'language'>) {
    this.type = value.type;
    this.content = value.content;
    this.language = value.language;
  }

  convertToHybrid(): this {
    if (this.type === 'code') {
      this.content = formatCodeFence(this.content, normalizeCodeLanguage(this.language));
    }
    this.type = 'hybrid';
    return this;
  }

  convertMarkdownCodeBlockToCode(): this {
    if (this.type === 'code') return this;
    const fence = standaloneFence(this.content);
    if (fence && fence.language !== 'mermaid') {
      this.type = 'code';
      this.content = fence.code;
      this.language = normalizeCodeLanguage(fence.language);
    }
    return this;
  }
}
