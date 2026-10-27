import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';
import { generationTracker } from '../../managers/GenerationTracker';

function normalizeCellType(type: string): 'code' | 'markdown' | 'hybrid' | 'image' | 'link' {
  if (type === 'Hybrid') return 'hybrid';
  if (type === 'video') return 'image';
  if (type === 'code' || type === 'hybrid' || type === 'image' || type === 'link') return type;
  return 'markdown';
}

/** Admits a detached creation request, then registers only a published cell owned by this notebook. */
export class AddCellAction extends StreamAction {
  async execute({ payload, notebookId }: StreamActionContext): Promise<void> {
    const { type, content, description, commandId, prompt, uniqueIdentifier } = payload;
    if (!type || (content === undefined && description === undefined)) return;
    if (typeof type !== 'string') throw new Error('Cell type must be a string');
    for (const value of [content, description, commandId, prompt, uniqueIdentifier]) {
      if (value !== undefined && typeof value !== 'string')
        throw new Error('Cell text fields must be strings');
    }
    const rawMetadata: unknown = payload.metadata ?? {};
    if (typeof rawMetadata !== 'object' || rawMetadata === null || Array.isArray(rawMetadata))
      throw new Error('Cell metadata must be an object');
    const metadata = structuredClone(rawMetadata) as Record<string, unknown>;
    if (metadata.isGenerating !== undefined && typeof metadata.isGenerating !== 'boolean')
      throw new Error('Cell generation flag must be a boolean');
    if (metadata.uniqueIdentifier !== undefined && typeof metadata.uniqueIdentifier !== 'string')
      throw new Error('Cell generation identity must be a string');
    const owner = useStore.getState();
    if (notebookId !== undefined && notebookId !== owner.notebookId) return;
    const initialContent = content ?? description ?? '';
    const serverId = uniqueIdentifier || (metadata.uniqueIdentifier as string | undefined);
    const generating =
      (type === 'image' || type === 'video') &&
      metadata.isGenerating === true &&
      Boolean(prompt || serverId);
    const normalized = normalizeCellType(type);
    const enableEdit = !metadata.isGenerating;
    const id = generating
      ? owner.addNewCellWithUniqueIdentifier(
          normalized,
          description ?? '',
          enableEdit,
          serverId,
          prompt
        )
      : owner.addNewCell2End(normalized, initialContent, enableEdit);

    // Creation publishes synchronously. Subscribers can still navigate or remove the cell.
    const current = useStore.getState();
    const target = current.cells.find((cell) => cell.id === id);
    if (current.notebookId !== owner.notebookId || !target) return;
    const generatedId = generating ? target.metadata?.uniqueIdentifier : undefined;
    if (typeof generatedId === 'string') metadata.uniqueIdentifier = generatedId;
    if (Object.keys(metadata).length) current.updateCellMetadata(id, metadata);
    const published = useStore.getState();
    if (
      published.notebookId !== owner.notebookId ||
      !published.cells.some((cell) => cell.id === id)
    )
      return;
    if (commandId) generationTracker.trackCell(commandId, id);
    if (typeof generatedId === 'string') generationTracker.trackCell(`unique-${generatedId}`, id);
  }
}

registerStreamAction('addCell2EndWithContent', AddCellAction);
