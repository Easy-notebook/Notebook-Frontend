/**
 * Add Cell Action - Handles addCell2EndWithContent stream type
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';
import globalUpdateInterface from '@/interfaces/globalUpdateInterface';
import { generationTracker } from '../../managers/GenerationTracker';

// Normalize incoming cell type to store-supported types
const normalizeCellTypeForStore = (
  t: string | undefined | null
): 'code' | 'markdown' | 'hybrid' | 'image' | 'link' => {
  if (!t) return 'markdown';
  if (t === 'Hybrid') return 'hybrid';
  if (t === 'image') return 'image';
  if (t === 'video') return 'image';
  if (t === 'thinking') return 'markdown';
  if (t === 'link') return 'link';
  return (t as any) === 'code' ||
    (t as any) === 'markdown' ||
    (t as any) === 'hybrid' ||
    (t as any) === 'image' ||
    (t as any) === 'link'
    ? (t as any)
    : 'markdown';
};

export class AddCellAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload } = context;

    const cellType = payload.type;
    const description = payload.description;
    const content = payload.content;
    const metadata = payload.metadata || {};
    const commandId = payload.commandId;
    const prompt = payload.prompt;
    const serverUniqueIdentifier = payload.uniqueIdentifier || metadata?.uniqueIdentifier;

    console.log('🆕 [AddCellAction] 收到创建cell请求:', {
      cellType,
      description: description?.substring(0, 50),
      contentLength: content?.length,
      commandId,
      uniqueIdentifier: serverUniqueIdentifier,
      metadata,
    });

    let newCellId: string | null = null;

    if (cellType && description) {
      const enableEdit = !metadata?.isGenerating;

      // If image/video generation task with unique identifier
      if (
        (cellType === 'image' || cellType === 'video') &&
        metadata?.isGenerating &&
        (prompt || serverUniqueIdentifier)
      ) {
        const uniqueIdentifier =
          serverUniqueIdentifier ||
          `gen-${Date.now()}-${(prompt || '')
            .substring(0, 20)
            .replace(/[^a-zA-Z0-9]/g, '')
            .toLowerCase()}`;

        const normalizedType = normalizeCellTypeForStore(cellType);
        newCellId = useStore
          .getState()
          .addNewCellWithUniqueIdentifier(
            normalizedType,
            description,
            enableEdit,
            uniqueIdentifier,
            prompt
          );

        // Track both commandId and uniqueIdentifier
        if (commandId) {
          generationTracker.trackCell(commandId, newCellId);
          generationTracker.trackCell(`unique-${uniqueIdentifier}`, newCellId);
          console.log('✅ [AddCellAction] 存储生成cell映射 (image/video):', {
            commandId,
            uniqueIdentifier,
            cellId: newCellId,
            trackerSize: generationTracker.getSize(),
          });
        } else {
          console.warn('⚠️ [AddCellAction] 图片/视频cell但没有commandId!', {
            uniqueIdentifier,
            cellId: newCellId,
          });
        }
      } else {
        // Normal cell creation
        const normalizedType = normalizeCellTypeForStore(cellType);
        newCellId = await globalUpdateInterface.addNewCell2End(
          normalizedType,
          description,
          enableEdit
        );

        // Store mapping if this is a generation task or has commandId
        if (newCellId && commandId) {
          generationTracker.trackCell(commandId, newCellId);
          console.log('✅ [AddCellAction] 存储cell映射:', {
            commandId,
            cellId: newCellId,
            cellType,
            trackerSize: generationTracker.getSize(),
          });
        }
      }
    }

    // Set initial content if provided
    if (content && newCellId) {
      const target = useStore.getState().cells.find((c) => c.id === newCellId);
      const appended = `${target?.content || ''}${content}`;
      useStore.getState().updateCell(newCellId, appended);
      console.log('✅ [AddCellAction] 已设置初始内容:', {
        cellId: newCellId,
        contentLength: appended.length,
      });
    } else if (content) {
      console.error('❌ [AddCellAction] 有内容但newCellId为null:', {
        contentLength: content.length,
        cellType,
        description,
      });
    }

    // Update metadata if provided
    if (metadata && newCellId) {
      const cells = useStore.getState().cells;
      const targetCell = cells.find((cell) => cell.id === newCellId);

      if (targetCell) {
        useStore.getState().updateCellMetadata(newCellId, metadata);
        console.log('✅ [AddCellAction] 已设置metadata:', { cellId: newCellId, metadata });
      } else {
        console.error('❌ [AddCellAction] 找不到刚创建的cell:', {
          newCellId,
          cellsCount: cells.length,
        });
      }
    }

    console.log('📊 [AddCellAction] Cell创建完成，当前tracker状态:', {
      newCellId,
      commandId,
      uniqueIdentifier: serverUniqueIdentifier,
      trackerSize: generationTracker.getSize(),
      trackerKeys: generationTracker.getAllTracked(),
    });
  }
}

registerStreamAction('addCell2EndWithContent', AddCellAction);
