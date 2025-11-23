/**
 * Update Cell Action - Handles updateCurrentCellWithContent stream type
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';
import globalUpdateInterface from '@/interfaces/globalUpdateInterface';
import { generationTracker } from '../../managers/GenerationTracker';

export class UpdateCellAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload } = context;

    const content = payload.content;
    const cellId = payload.cellId;
    const commandId = payload.commandId;
    const uniqueIdentifier = payload.uniqueIdentifier;

    console.log('🔄 [UpdateCellAction] 更新cell的内容:', {
      cellId,
      commandId,
      uniqueIdentifier,
      contentLength: content?.length,
      trackerSize: generationTracker.getSize(),
      hasCommandIdInTracker: commandId ? generationTracker.hasIdentifier(commandId) : false,
    });

    if (!content) {
      console.error('❌ [UpdateCellAction] 没有content数据');
      return;
    }

    let targetCellId = cellId;

    // Try uniqueIdentifier first (highest priority)
    if (!targetCellId && uniqueIdentifier) {
      const success = useStore
        .getState()
        .updateCellByUniqueIdentifier(uniqueIdentifier, { content });
      if (success) {
        console.log(
          '✅ [UpdateCellAction] 通过uniqueIdentifier成功更新cell内容:',
          uniqueIdentifier
        );
        return;
      }
    }

    // Try commandId from tracker
    if (!targetCellId && commandId && generationTracker.hasIdentifier(commandId)) {
      targetCellId = generationTracker.getCellId(commandId);
      console.log('✅ [UpdateCellAction] 从映射表获取cellId:', { commandId, targetCellId });
    } else if (!targetCellId && commandId) {
      console.error('❌ [UpdateCellAction] commandId不在映射表中:', {
        commandId,
        trackerKeys: generationTracker.getAllTracked(),
      });
    }

    // Update the target cell
    if (targetCellId) {
      console.log(
        '✅ 更新指定cell的内容:',
        targetCellId,
        'content preview:',
        content.substring(0, 100)
      );
      await globalUpdateInterface.updateCell(targetCellId, content);
      console.log('✅ 指定cell内容更新完成');
    } else {
      // Fallback: use last added cell
      const lastAddedCellId = globalUpdateInterface.getAddedLastCellID();
      console.log('⬇️ 回退逻辑 - lastAddedCellId:', lastAddedCellId);

      if (lastAddedCellId) {
        const cells = useStore.getState().cells;
        const targetCell = cells.find((cell) => cell.id === lastAddedCellId);

        if (targetCell && targetCell.metadata?.isGenerating) {
          console.log('✅ 更新最后添加的生成cell内容:', lastAddedCellId);
          await globalUpdateInterface.updateCell(lastAddedCellId, content);
        } else if (cells.length > 0) {
          const lastCell = cells[cells.length - 1];
          console.log('✅ 使用最后一个cell:', lastCell.id);
          await globalUpdateInterface.updateCell(lastCell.id, content);
        } else {
          console.error('❌ 没有任何cell可以更新内容');
        }
      } else {
        const cells = useStore.getState().cells;
        if (cells.length > 0) {
          const lastCell = cells[cells.length - 1];
          console.log('✅ 使用最后一个cell:', lastCell.id);
          await globalUpdateInterface.updateCell(lastCell.id, content);
        } else {
          console.error('❌ 没有任何cell可以更新内容');
        }
      }
    }
  }
}

registerStreamAction('updateCurrentCellWithContent', UpdateCellAction);
