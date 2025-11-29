// src/store/autoActions.ts
/**
 * Auto Actions - Legacy module for backward compatibility
 *
 * These functions are being migrated to the new workflow action system.
 * @see src/components/Scenario/Workflow/actions/code/
 *
 * @deprecated Use workflow actions instead:
 * - sendCurrentCellExecuteCodeResult -> SendCodeOutputAction
 * - sendCurrentCellExecuteCodeError_should_debug -> DebugCodeAction
 */

import useOperatorStore from '@Store/operatorStore';
import useStore from '@Store/notebookStore';
import useCodeStore from '@Store/codeStore';
import type { Operation } from '@Store/models/operation';
import { storeLog } from '@Utils/logger';

/**
 * 代码输出操作载荷接口
 */
export interface CodeOutputPayload {
  executeResult: any[];
  executeCode: string;
  cellId: string;
  description?: string;
}

/**
 * 代码错误调试操作载荷接口
 */
export interface CodeErrorPayload {
  error: any[];
  executeCode: string;
  HistoryCode: string;
  cellId: string;
  description: string;
}

/**
 * 发送当前单元格执行代码结果
 * @deprecated Use SendCodeOutputAction instead
 */
export const sendCurrentCellExecuteCodeResult = (): void => {
  const currentCell = useStore.getState().getCurrentCell();
  const notebookId = useStore.getState().notebookId;

  if (!currentCell) {
    storeLog.warn('No current cell found, cannot send execute code result');
    return;
  }

  if (currentCell.type !== 'code') {
    storeLog.warn('Current cell is not a code cell, cannot send execute code result', {
      cellType: currentCell.type,
    });
    return;
  }

  const executeResult = currentCell.outputs;

  if (!executeResult) {
    storeLog.warn('No execute result found, executing cell first', { cellId: currentCell.id });
    useCodeStore.getState().executeCell(currentCell.id);
    return;
  }

  const operation: Operation = {
    type: 'code_output',
    payload: {
      executeResult: executeResult,
      executeCode: currentCell.content,
      cellId: currentCell.id,
      description: currentCell.description,
    } as CodeOutputPayload,
  };

  useOperatorStore.getState().sendOperation(notebookId, operation);
};

/**
 * 发送当前单元格执行代码错误(需要调试)
 * @deprecated Use DebugCodeAction instead
 */
export const sendCurrentCellExecuteCodeError_should_debug = (): void => {
  const currentCell = useStore.getState().getCurrentCell();
  const historyCode = useStore.getState().getHistoryCode();
  const notebookId = useStore.getState().notebookId;

  if (!currentCell) {
    storeLog.warn('No current cell found, cannot send execute code error');
    return;
  }

  if (currentCell.type !== 'code') {
    storeLog.warn('Current cell is not a code cell, cannot send execute code error', {
      cellType: currentCell.type,
    });
    return;
  }

  const operation: Operation = {
    type: 'code_error_should_debug',
    payload: {
      error: currentCell.outputs,
      executeCode: currentCell.content,
      HistoryCode: historyCode,
      cellId: currentCell.id,
      description: currentCell.description ? currentCell.description : '',
    } as CodeErrorPayload,
  };

  useOperatorStore.getState().sendOperation(notebookId, operation);
};
