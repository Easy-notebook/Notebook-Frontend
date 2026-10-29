import useStore from '@Store/notebookStore';
import { AutoSaveService } from '../autoSave/AutoSaveService';
import { notebookAgentProfiles, type NotebookAgentIdentity } from './NotebookAgentIdentity';
import { sessionHistoryCells, type SessionHistory } from './SessionHistoryImport';
export async function sessionRequest<T>(
  operation: 'list' | 'preview' | 'bind',
  input: unknown,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(`/agent-api/sessions/${operation}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Session request failed');
  return value;
}
export async function importAndConnectSession(
  profile: NotebookAgentIdentity,
  history: SessionHistory
) {
  const owner = profile.notebookId;
  const assertOwner = () => {
    if (useStore.getState().notebookId !== owner)
      throw new Error('Notebook 已切换；未连接 session');
  };
  assertOwner();
  const saves = AutoSaveService.getInstance();
  await saves.initialize();
  assertOwner();
  const state = useStore.getState();
  const ids = new Set(state.cells.map((cell) => cell.id));
  const imported = sessionHistoryCells(history).filter((cell) => !ids.has(cell.id));
  // Append only: preserve the existing notebook and edited imported cells on retry.
  if (imported.length) state.setCells([...state.cells, ...imported]);
  const current = useStore.getState();
  await saves.saveNow({
    notebookId: owner,
    notebookTitle: current.notebookTitle,
    cells: current.cells,
    tasks: current.tasks,
    timestamp: Date.now(),
  });
  assertOwner();
  // Bind only after history is durable. A conflict leaves history readable, with no false resume claim.
  await sessionRequest('bind', {
    notebookId: owner,
    agentId: profile.agentId,
    revision: profile.revision,
    provider: history.info.provider,
    sessionId: history.info.sessionId,
  });
  await notebookAgentProfiles.load(owner);
}
