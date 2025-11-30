import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useNotebookStore from '@Store/notebookStore';

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

    // 1. Update cell type to 'code'
    notebookStore.updateCellType(targetCellId, 'code');

    // 2. Ensure cell is editable
    notebookStore.updateCellCanEdit(targetCellId, true);

    // 3. Clean up metadata (optional but recommended to remove "thinking" artifacts)
    // We use updateCellObject to be safe
    const cell = notebookStore.cells.find((c) => c.id === targetCellId);
    if (cell) {
      const newMetadata = { ...cell.metadata };
      // Remove thinking-related metadata if present
      delete newMetadata.agentName;
      delete newMetadata.customText;
      delete newMetadata.textArray;
      delete newMetadata.useWorkflowThinking;

      // Ensure language is python (default for code cells)
      if (!newMetadata.language) {
        newMetadata.language = 'python';
      }

      notebookStore.updateCellObject(targetCellId, {
        metadata: newMetadata,
      });
    }
  }
}

registerStreamAction(ConvertToCodeCellAction.actionType, ConvertToCodeCellAction);
