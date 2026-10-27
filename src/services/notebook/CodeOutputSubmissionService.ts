import useNotebookStore from '@Store/notebookStore';
import useCodeStore from '@Store/codeStore';
import useOperatorStore from '@Store/operatorStore';
import type { Cell } from '@Store/models/cell';

export interface CodeOutputPayload {
  executeResult: NonNullable<Cell['outputs']>;
  executeCode: string;
  cellId: string;
  description?: Cell['description'];
}

export type CodeOutputSubmissionResult = { success: true } | { success: false; error: string };

/** Shares output submission policy between workflow and public command adapters. */
export class CodeOutputSubmissionService {
  static async submitCurrentCell(signal?: AbortSignal): Promise<CodeOutputSubmissionResult> {
    signal?.throwIfAborted();
    const state = useNotebookStore.getState();
    const cell = state.getCurrentCell();
    if (!cell) return { success: false, error: 'No current cell' };
    if (cell.type !== 'code') return { success: false, error: 'Not a code cell' };

    // Preserve the existing prepare-only behavior when no output snapshot exists.
    // An empty output list is a valid snapshot of a silent execution.
    if (!cell.outputs) {
      void useCodeStore.getState().executeCell(cell.id);
      return { success: false, error: 'No execute result' };
    }

    const payload: CodeOutputPayload = {
      executeResult: cell.outputs,
      executeCode: cell.content,
      cellId: cell.id,
      description: cell.description,
    };
    try {
      // Dispatcher captures the payload and owns notebook changes during admission.
      const receipt = await useOperatorStore.getState().submitOperation(
        state.notebookId,
        {
          type: 'code_output',
          payload,
        },
        signal
      );
      return receipt.accepted ? { success: true } : { success: false, error: receipt.message };
    } catch (error) {
      signal?.throwIfAborted();
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
