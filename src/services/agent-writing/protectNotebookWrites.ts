import type { StateCreator } from 'zustand';
import type { Cell } from '@Store/models';
import { agentWriting } from './AgentWriting';

/** One boundary covers store actions and imperative setState, including bulk replacement. */
export function protectNotebookWrites<T extends { notebookId: string | null; cells: Cell[] }>(
  create: StateCreator<T>
): StateCreator<T> {
  return (set, get, api) => {
    const guarded: typeof set = (update, replace) => {
      const before = get();
      const patch = typeof update === 'function' ? update(before) : update;
      if (before && (patch.notebookId === undefined || patch.notebookId === before.notebookId))
        agentWriting.assertMutation(before.notebookId, before.cells, patch.cells ?? before.cells);
      if (replace) set(patch as T, true);
      else set(patch, false);
    };
    api.setState = guarded;
    return create(guarded, get, api);
  };
}
