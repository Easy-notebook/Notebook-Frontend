// src/store/models/cell.ts
import { v4 as uuidv4 } from 'uuid';

export type CellType = 'code' | 'markdown' | 'raw' | 'hybrid' | 'image' | 'thinking' | 'link';

export interface OutputItem {
  type: string;
  content: any;
  timestamp?: string;
  key?: string | number;
}

export interface Cell {
  id: string;
  type: CellType;
  content: string;
  outputs?: OutputItem[];
  enableEdit?: boolean;
  phaseId?: string | null;
  description?: string | null;
  metadata?: Record<string, any> | null;
  [key: string]: any; // Keep structural compatibility with UI code accessing arbitrary fields
}

export class CellModel implements Cell {
  id: string;
  type: CellType;
  content: string;
  outputs: OutputItem[];
  enableEdit: boolean;
  phaseId: string | null;
  description: string | null;
  metadata: Record<string, any> | null;

  constructor(init: Partial<Cell> & { id?: string; type: CellType }) {
    this.id = init.id ?? uuidv4();
    this.type = init.type;
    this.content = init.content ?? '';
    this.outputs = Array.isArray(init.outputs) ? [...init.outputs] : [];
    this.enableEdit = init.enableEdit ?? true;
    this.phaseId = init.phaseId ?? null;
    this.description = init.description ?? null;
    this.metadata = init.metadata ?? null;
  }

  static create(type: CellType, opts?: Partial<Omit<Cell, 'type' | 'id'>>): CellModel {
    return new CellModel({ type, ...opts });
  }

  static fromJSON(dto: Cell): CellModel {
    return new CellModel({ ...dto, type: dto.type });
  }

  toJSON(): Cell {
    return {
      id: this.id,
      type: this.type,
      content: this.content,
      outputs: this.outputs ? [...this.outputs] : [],
      enableEdit: this.enableEdit,
      phaseId: this.phaseId,
      description: this.description,
      metadata: this.metadata ? { ...this.metadata } : undefined,
    };
  }

  setContent(content: string): this {
    this.content = typeof content === 'string' ? content : String(content ?? '');
    return this;
  }

  appendContent(content: string): this {
    this.content = `${this.content}${content}`;
    return this;
  }

  clearOutputs(): this {
    this.outputs = [];
    return this;
  }

  setEditable(value: boolean): this {
    this.enableEdit = value;
    return this;
  }

  setMetadata(metadata: Record<string, any>): this {
    this.metadata = { ...(this.metadata || {}), ...metadata };
    return this;
  }

  convertToHybrid(): this {
    this.type = 'hybrid';
    return this;
  }

  convertMarkdownCodeBlockToCode(): this {
    const lines = this.content.split('\n');
    const codeFence = /^```(\w+)?$/;
    for (let i = 0; i < lines.length; i++) {
      if (codeFence.test(lines[i].trim())) {
        let codeContent = '';
        let j = i + 1;
        while (j < lines.length && !codeFence.test(lines[j].trim())) {
          codeContent += lines[j] + '\n';
          j++;
        }
        this.type = 'code';
        this.content = codeContent.trim();
        break;
      }
    }
    return this;
  }

  static sanitizeOutputs(outputs: OutputItem[] | undefined | null): OutputItem[] {
    if (!outputs) return [];
    try {
      // Ensure deep-clone friendly, normalize content field
      return outputs.map((o) => {
        const item: OutputItem = { ...o };
        if (typeof item.content === 'object' && item.content !== null) {
          try {
            // keep structured content as-is; caller may stringify on persist
            item.content = JSON.parse(JSON.stringify(item.content));
          } catch {
            // fallback to string
            item.content = String(item.content);
          }
        }
        return item;
      });
    } catch {
      return [];
    }
  }

  static hasError(outputs: OutputItem[]): boolean {
    return Array.isArray(outputs) && outputs.some((o) => o.type === 'error');
  }

  setOutputs(outputs: OutputItem[]): this {
    const outArr = CellModel.sanitizeOutputs(outputs);
    const isErr = CellModel.hasError(outArr);
    if (outArr.length > 0) {
      this.outputs = isErr
        ? [{ type: 'text', content: '[error-message-for-debug]', timestamp: '' }, ...outArr]
        : [...outArr];
    } else {
      this.outputs = [{ type: 'text', content: '[without-output]', timestamp: '' }, ...outArr];
    }
    return this;
  }
}

export type UploadMode = 'unrestricted' | 'restricted';
