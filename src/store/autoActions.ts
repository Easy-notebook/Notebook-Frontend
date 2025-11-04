// src/store/autoActions.ts
import useOperatorStore from './operatorStore';
import useStore from './notebookStore';
import useCodeStore from './codeStore';
import { AgentMemoryService, AgentType } from '../services/agentMemoryService';

/**
 * 操作类型定义
 */
export interface Operation {
    type: string;
    payload: Record<string, any>;
}

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
 */
export const sendCurrentCellExecuteCodeResult = (): void => {
    const currentCell = useStore.getState().getCurrentCell();
    const notebookId = useStore.getState().notebookId;
    
    if (!currentCell) {
        console.warn('No current cell found, cannot send execute code result.');
        return;
    }

    if (currentCell.type !== 'code') {
        console.warn('Current cell is not a code cell, cannot send execute code result.');
        return;
    }
    
    const executeResult = currentCell.outputs;

    if (!executeResult) {
        console.warn('No execute result found, cannot send execute code result.');
        useCodeStore.getState().executeCell(currentCell.id);
        return;
    }

    // 准备Output Agent记忆上下文
    const outputMemoryContext = AgentMemoryService.prepareMemoryContextForBackend(
        notebookId,
        'output' as AgentType,
        {
            current_cell_id: currentCell.id,
            execute_result: executeResult,
            executed_code: currentCell.content,
            cell_description: currentCell.description || '',
            output_type: Array.isArray(executeResult) ? 'array' : typeof executeResult
        }
    );

    // 更新用户意图（用户想要分析输出结果）
    AgentMemoryService.updateUserIntent(
        notebookId,
        'output' as AgentType,
        ['analyze_output'], // 明确目标：分析输出
        ['data_analysis', 'result_interpretation'], // 推断目标
        `分析代码执行结果`, // 当前焦点
        [] // 当前阻塞
    );

    // 记录输出分析交互启动
    AgentMemoryService.recordOperationInteraction(
        notebookId,
        'output' as AgentType,
        'output_analysis_started',
        true,
        {
            cell_id: currentCell.id,
            output_size: Array.isArray(executeResult) ? executeResult.length : 1,
            code_length: currentCell.content.length,
            has_description: !!currentCell.description,
            start_time: new Date().toISOString()
        }
    );
    
    const operation: Operation = {
        type: 'code_output',
        payload: {
            executeResult: executeResult,
            executeCode: currentCell.content,
            cellId: currentCell.id,
            description: currentCell.description,
            // 添加记忆上下文
            ...outputMemoryContext
        } as CodeOutputPayload
    };
    
    useOperatorStore.getState().sendOperation(notebookId, operation);
}

/**
 * 发送当前单元格执行代码错误(需要调试)
 */
export const sendCurrentCellExecuteCodeError_should_debug = (): void => {
    const currentCell = useStore.getState().getCurrentCell();
    const historyCode = useStore.getState().getHistoryCode();
    const notebookId = useStore.getState().notebookId;
    
    if (!currentCell) {
        console.warn('No current cell found, cannot send execute code error.');
        return;
    }

    if (currentCell.type !== 'code') {
        console.warn('Current cell is not a code cell, cannot send execute code error.');
        return;
    }

    // 准备Debug Agent记忆上下文
    const debugMemoryContext = AgentMemoryService.prepareMemoryContextForBackend(
        notebookId,
        'debug' as AgentType,
        {
            current_cell_id: currentCell.id,
            error_context: currentCell.outputs,
            current_code: currentCell.content,
            history_code: historyCode,
            cell_description: currentCell.description || ''
        }
    );

    // 提取错误信息用于用户意图更新
    const errorMessage = Array.isArray(currentCell.outputs) && currentCell.outputs.length > 0 
        ? JSON.stringify(currentCell.outputs[0]) 
        : 'unknown_error';

    // 更新用户意图（用户想要修复错误）
    AgentMemoryService.updateUserIntent(
        notebookId,
        'debug' as AgentType,
        ['fix_code_error'], // 明确目标：修复代码错误
        ['debug_issue', 'code_fixing'], // 推断目标
        `修复代码错误: ${errorMessage.substring(0, 100)}`, // 当前焦点
        [errorMessage] // 当前阻塞：具体错误
    );

    // 设置debug上下文状态为进行中
    AgentMemoryService.updateCurrentContext(
        notebookId,
        'debug' as AgentType,
        {
            interaction_status: 'in_progress',
            debug_start_time: new Date().toISOString(),
            current_error: errorMessage,
            fix_applied: false
        }
    );

    // 记录调试交互启动
    AgentMemoryService.recordOperationInteraction(
        notebookId,
        'debug' as AgentType,
        'debug_started',
        true,
        {
            cell_id: currentCell.id,
            error_type: typeof currentCell.outputs,
            error_preview: errorMessage.substring(0, 200),
            code_length: currentCell.content.length,
            has_history: !!historyCode,
            start_time: new Date().toISOString()
        }
    );

    const operation: Operation = {
        type: 'code_error_should_debug',
        payload: {
            error: currentCell.outputs,
            executeCode: currentCell.content,
            HistoryCode: historyCode,
            cellId: currentCell.id,
            description: currentCell.description ? currentCell.description : '',
            // 添加记忆上下文
            ...debugMemoryContext
        } as CodeErrorPayload
    };
    
    useOperatorStore.getState().sendOperation(notebookId, operation);
}