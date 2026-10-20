import type { Output } from '../utils/types';
import { processOutput } from '../utils/outputProcessing';

/** Immutable store outputs retain their derived payload and React identity. */
export class OutputProjection {
  private source?: readonly unknown[];
  private result: Output[] = [];
  private readonly entries = new WeakMap<object, Output | null>();

  project(source?: readonly unknown[]): Output[] {
    if (source === this.source) return this.result;
    const result: Output[] = [];
    for (const value of source ?? []) {
      if (!value || typeof value !== 'object') continue;
      let output = this.entries.get(value);
      if (output === undefined) {
        const processed = processOutput(value);
        output = processed ? { ...processed, key: processed.key ?? crypto.randomUUID() } : null;
        this.entries.set(value, output);
      }
      if (output) result.push(output);
    }
    this.source = source;
    this.result = result;
    return result;
  }
}
