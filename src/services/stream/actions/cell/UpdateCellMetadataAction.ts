/**
 * Update Cell Metadata Action - Handles updateCurrentCellMetadata stream type
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';
import globalUpdateInterface from '@/interfaces/globalUpdateInterface';
import { generationTracker } from '../../managers/GenerationTracker';

export class UpdateCellMetadataAction extends StreamAction {
  execute(context: StreamActionContext): void {
    const { payload } = context;

    const metadata = payload.metadata;
    const commandId = payload.commandId;
    const cellId = payload.cellId;
    const uniqueIdentifier = payload.uniqueIdentifier;

    console.log('🔄 [UpdateCellMetadataAction] 更新cell metadata:', {
      metadata,
      commandId,
      cellId,
      uniqueIdentifier,
      trackerSize: generationTracker.getSize(),
      hasCommandIdInTracker: commandId ? generationTracker.hasIdentifier(commandId) : false,
    });

    if (!metadata) {
      console.error('❌ [UpdateCellMetadataAction] 没有metadata数据');
      return;
    }

    let targetCellId = cellId;

    // Try uniqueIdentifier first (highest priority)
    if (!targetCellId && uniqueIdentifier) {
      const success = useStore
        .getState()
        .updateCellByUniqueIdentifier(uniqueIdentifier, { metadata });
      if (success) {
        console.log(
          '✅ [UpdateCellMetadataAction] 通过uniqueIdentifier成功更新cell metadata:',
          uniqueIdentifier
        );

        // Clean up tracking if generation completed
        if (metadata.isGenerating === false || metadata.generationCompleted) {
          if (commandId) generationTracker.untrackCell(commandId);
          generationTracker.untrackCell(`unique-${uniqueIdentifier}`);
          console.log('🧹 清理完成的生成任务映射:', { commandId, uniqueIdentifier });
        }
        return;
      }
    }

    // Try commandId from tracker
    if (!targetCellId && commandId && generationTracker.hasIdentifier(commandId)) {
      targetCellId = generationTracker.getCellId(commandId);
      console.log('✅ [UpdateCellMetadataAction] 从映射表获取cellId:', { commandId, targetCellId });

      // Clean up tracking if generation completed
      if (metadata.isGenerating === false || metadata.generationCompleted) {
        generationTracker.untrackCell(commandId);
        console.log('🧹 [UpdateCellMetadataAction] 清理完成的生成任务映射:', commandId);
      }
    } else if (!targetCellId && commandId) {
      console.error('❌ [UpdateCellMetadataAction] commandId不在映射表中:', {
        commandId,
        trackerKeys: generationTracker.getAllTracked(),
      });
    }

    // Fallback: use last added cell
    if (!targetCellId) {
      targetCellId = globalUpdateInterface.getAddedLastCellID();
      console.log('⬇️ [UpdateCellMetadataAction] 使用lastAddedCellId作为fallback:', targetCellId);
    }

    // Update the metadata
    if (targetCellId) {
      console.log('🔄 正在更新cell metadata, cellId:', targetCellId, 'metadata:', metadata);
      useStore.getState().updateCellMetadata(targetCellId, metadata);
      console.log('✅ metadata更新完成');

      // Verify update
      const updatedCells = useStore.getState().cells;
      const updatedCell = updatedCells.find((c) => c.id === targetCellId);
      console.log('📋 验证更新后的cell:', {
        id: updatedCell?.id,
        contentLength: updatedCell?.content?.length,
        metadata: updatedCell?.metadata,
      });
    } else {
      console.warn('⚠️ 无法确定目标cellId，使用最后一个cell作为默认');
      const cells = useStore.getState().cells;
      if (cells.length > 0) {
        const lastCell = cells[cells.length - 1];
        console.log('✅ 使用最后一个cell:', lastCell.id);
        useStore.getState().updateCellMetadata(lastCell.id, metadata);
      } else {
        console.error('❌ 没有任何cell可以更新metadata');
      }
    }
  }
}

registerStreamAction('updateCurrentCellMetadata', UpdateCellMetadataAction);
