/**
 * Generation Tracker - Manages tracking of cell generation tasks
 *
 * Replaces global generationCellTracker Map with a proper class
 */

import { networkLog } from '@Utils/logger';

export class GenerationTracker {
  private static instance: GenerationTracker;
  private cellTracker: Map<string, string> = new Map(); // commandId/uniqueId -> cellId

  private constructor() {}

  static getInstance(): GenerationTracker {
    if (!GenerationTracker.instance) {
      GenerationTracker.instance = new GenerationTracker();
    }
    return GenerationTracker.instance;
  }

  /**
   * Store mapping between command/unique identifier and cell ID
   */
  trackCell(identifier: string, cellId: string): void {
    this.cellTracker.set(identifier, cellId);
    networkLog.debug('Cell tracking stored', {
      identifier,
      cellId,
      totalTracked: this.cellTracker.size,
    });
  }

  /**
   * Get cell ID by identifier
   */
  getCellId(identifier: string): string | undefined {
    return this.cellTracker.get(identifier);
  }

  /**
   * Check if identifier is tracked
   */
  hasIdentifier(identifier: string): boolean {
    return this.cellTracker.has(identifier);
  }

  /**
   * Remove tracking for an identifier
   */
  untrackCell(identifier: string): void {
    const removed = this.cellTracker.delete(identifier);
    if (removed) {
      networkLog.debug('Cell tracking removed', {
        identifier,
        remainingTracked: this.cellTracker.size,
      });
    }
  }

  /**
   * Get all tracked identifiers (for debugging)
   */
  getAllTracked(): string[] {
    return Array.from(this.cellTracker.keys());
  }

  /**
   * Get tracker size
   */
  getSize(): number {
    return this.cellTracker.size;
  }

  /**
   * Clear all tracking
   */
  clear(): void {
    this.cellTracker.clear();
    networkLog.info('Cell tracker cleared');
  }
}

export const generationTracker = GenerationTracker.getInstance();
