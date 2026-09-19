import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useNotebookStore from '@Store/notebookStore';
import { getCellIndexById } from '@Store/models/cellIndex';
import { normalizeCodeLanguage } from '@Store/models/codeLanguage';

export class ConvertToCodeCellAction extends StreamAction {
  static actionType = 'convert_to_code_cell';

  async execute(context: StreamActionContext): Promise<void> {
    const { payload } = context;
    const notebookStore = useNotebookStore.getState();

    // Determine target cell ID
    let targetCellId = payload.cellId;
    if (!targetCellId) {
      targetCellId = notebookStore.currentCellId || undefined;
    }

    if (!targetCellId) {
      console.warn('[ConvertToCodeCellAction] No cell ID provided and no current cell selected');
      return;
    }

    console.log(`[ConvertToCodeCellAction] Converting cell ${targetCellId} to code cell`);

    const index = getCellIndexById(notebookStore.cells, targetCellId);
    if (index !== undefined) {
      const cell = notebookStore.cells[index];
      const newMetadata = { ...cell.metadata };
      // Remove thinking-related metadata if present
      delete newMetadata.agentName;
      delete newMetadata.customText;
      delete newMetadata.textArray;
      delete newMetadata.useWorkflowThinking;

      const language = normalizeCodeLanguage(cell.language ?? newMetadata.language);
      newMetadata.language = language;
      if (cell.type === 'code' && cell.enableEdit === true && cell.language === language &&
        Object.keys(cell.metadata || {}).length === Object.keys(newMetadata).length &&
        Object.keys(newMetadata).every(key => cell.metadata?.[key] === newMetadata[key])) return;
      // Replace metadata rather than merging deleted thinking fields back into it.
      const cells = notebookStore.cells.slice();
      cells[index] = { ...cell, type: 'code', enableEdit: true, language, metadata: newMetadata };
      notebookStore.setCells(cells);
    }
  }
}

registerStreamAction(ConvertToCodeCellAction.actionType, ConvertToCodeCellAction);
