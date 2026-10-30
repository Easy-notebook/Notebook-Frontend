import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  state: {} as any,
  send: vi.fn(),
  active: vi.fn(),
  configure: vi.fn(),
  load: vi.fn(),
}));
vi.mock('@Store/notebookStore', () => ({ default: { getState: () => mocks.state } }));
vi.mock('./agentCellService', () => ({
  agentCellService: { send: mocks.send, isActive: mocks.active, configure: mocks.configure },
}));
vi.mock('./NotebookAgentIdentity', () => ({ notebookAgentProfiles: { load: mocks.load } }));
import { notebookConversation, useNotebookConversation } from './NotebookConversation';
beforeEach(() => {
  vi.resetAllMocks();
  useNotebookConversation.setState({ selected: {} });
  mocks.send.mockResolvedValue(undefined);
  mocks.load.mockResolvedValue({ agentId: 'book-agent', provider: 'codex' });
  mocks.state = {
    notebookId: 'book',
    setIsRightSidebarCollapsed: vi.fn(),
    cells: [],
    addCell: vi.fn((cell) => {
      mocks.state.cells.push({ ...cell, id: 'new' });
      return 'new';
    }),
  };
});
it('creates and reuses the notebook-owned conversation', async () => {
  await notebookConversation.submit('book', 'hello', vi.fn());
  await notebookConversation.submit('book', 'continue', vi.fn());
  expect(mocks.state.addCell).toHaveBeenCalledTimes(1);
  expect(mocks.state.setIsRightSidebarCollapsed).toHaveBeenCalledWith(false);
  expect(useNotebookConversation.getState().selected.book).toBe('new');
  expect(mocks.state.cells[0].metadata.agent.notebookAgentId).toBe('book-agent');
  expect(mocks.send).toHaveBeenLastCalledWith('new', 'continue');
});
it('ignores selected unrelated workers and uses the notebook profile provider', async () => {
  mocks.load.mockResolvedValue({ agentId: 'book-agent', provider: 'claude' });
  mocks.state.cells = [{ id: 'other', type: 'agent', metadata: { agent: { provider: 'codex' } } }];
  useNotebookConversation.getState().select('book', 'other');
  await notebookConversation.submit('book', 'hello', vi.fn());
  expect(mocks.send).toHaveBeenCalledWith('new', 'hello');
  expect(mocks.state.cells[1].metadata.agent.provider).toBe('claude');
});
it('preserves the same agent binding when provider changes', async () => {
  mocks.state.cells = [
    {
      id: 'owned',
      type: 'agent',
      metadata: { agent: { notebookAgentId: 'book-agent', provider: 'claude' } },
    },
  ];
  await notebookConversation.submit('book', 'hello', vi.fn());
  expect(mocks.configure).toHaveBeenCalledWith('owned', 'codex');
  expect(mocks.send).toHaveBeenCalledWith('owned', 'hello');
});
it('rejects a busy notebook agent', async () => {
  mocks.state.cells = [
    { id: 'owned', type: 'agent', metadata: { agent: { notebookAgentId: 'book-agent' } } },
  ];
  mocks.active.mockReturnValue(true);
  await expect(notebookConversation.submit('book', 'hello', vi.fn())).rejects.toThrow('正在回答');
  expect(mocks.send).not.toHaveBeenCalled();
});
it('rejects workspace changes while loading identity', async () => {
  mocks.load.mockImplementation(async () => {
    mocks.state.notebookId = 'other';
    return { agentId: 'book-agent', provider: 'codex' };
  });
  await expect(notebookConversation.submit('book', 'hello', vi.fn())).rejects.toThrow('已切换');
  expect(mocks.send).not.toHaveBeenCalled();
});
it('fails closed if native identity cannot load', async () => {
  mocks.load.mockRejectedValue(new Error('offline'));
  await expect(notebookConversation.submit('book', 'hello', vi.fn())).rejects.toThrow('offline');
  expect(mocks.state.addCell).not.toHaveBeenCalled();
});

it('does not reuse a conversation from before binding an imported provider session', async () => {
  mocks.load.mockResolvedValue({
    agentId: 'book-agent',
    provider: 'codex',
    source: { sessionId: '11111111-1111-4111-8111-111111111111' },
  });
  mocks.state.cells = [
    {
      id: 'old',
      type: 'agent',
      metadata: { agent: { notebookAgentId: 'book-agent', provider: 'codex' } },
    },
  ];
  await notebookConversation.submit('book', 'continue original', vi.fn());
  expect(mocks.send).toHaveBeenCalledWith('new', 'continue original');
  expect(mocks.state.cells[1].metadata.agent.sourceSessionId).toBe(
    '11111111-1111-4111-8111-111111111111'
  );
});
