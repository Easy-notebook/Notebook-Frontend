import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AgentMemoryService } from '@Services/agentMemoryService';
import useStore from '@Store/notebookStore';
import { RememberInformationAction } from './RememberInformationAction';

beforeEach(() => {
  AgentMemoryService.clearAllMemories();
  useStore.setState({ notebookId: 'selected' });
});
afterEach(() => {
  vi.restoreAllMocks();
  AgentMemoryService.clearAllMemories();
});

it('persists information under the explicit notebook and agent using existing context history', async () => {
  const showToast = vi.fn(async () => {
    expect(JSON.parse(localStorage.getItem('agent_memories_v2')!).explicit_debug).toBeDefined();
  });
  await new RememberInformationAction().execute({
    notebookId: 'explicit',
    payload: { information: 'Prefer small examples', category: 'preference', agentType: 'debug' },
    showToast,
  });
  expect(AgentMemoryService.getAgentMemory('selected', 'general')).toBeNull();
  expect(
    AgentMemoryService.getAgentMemory('explicit', 'debug')?.situation_tracking.current_context?.[0]
  ).toMatchObject({
    context_update: { information: 'Prefer small examples', category: 'preference' },
    agent_type: 'debug',
  });
  AgentMemoryService.loadFromStorage();
  expect(
    AgentMemoryService.prepareMemoryContextForBackend('explicit', 'debug', {}).agent_memory
      .situation_tracking.current_context
  ).toHaveLength(1);
  expect(showToast).toHaveBeenCalledWith({ message: '信息已记忆', type: 'success' });
});

it.each([false, true])(
  'does not mutate memory or acknowledge success when persistence fails (existing=%s)',
  async (existing) => {
    if (existing)
      AgentMemoryService.rememberInformation('selected', 'general', 'original', 'general');
    const before = structuredClone(AgentMemoryService.getAgentMemory('selected', 'general'));
    const stored = localStorage.getItem('agent_memories_v2');
    const update = vi.fn();
    window.addEventListener('agentMemoryUpdated', update);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const showToast = vi.fn();
    try {
      await expect(
        new RememberInformationAction().execute({ payload: { information: 'new' }, showToast })
      ).rejects.toThrow('full');
      expect(AgentMemoryService.getAgentMemory('selected', 'general')).toEqual(before);
      expect(localStorage.getItem('agent_memories_v2')).toBe(stored);
      expect(showToast).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('agentMemoryUpdated', update);
    }
  }
);

it('retains the ten newest context records and keeps other agent memories intact', () => {
  AgentMemoryService.rememberInformation('other', 'output', 'keep', 'general');
  for (let i = 0; i < 12; i++)
    AgentMemoryService.rememberInformation('selected', 'general', String(i), 'general');
  const records = AgentMemoryService.getAgentMemory('selected', 'general')!.situation_tracking
    .current_context!;
  expect(records).toHaveLength(10);
  expect(records[0].context_update.information).toBe('11');
  expect(records[9].context_update.information).toBe('2');
  expect(
    AgentMemoryService.getAgentMemory('other', 'output')!.situation_tracking.current_context
  ).toHaveLength(1);
});

it('rejects missing ownership and unsupported agents without writing records', async () => {
  const action = new RememberInformationAction();
  const showToast = vi.fn();
  useStore.setState({ notebookId: null });
  await expect(action.execute({ payload: { information: 'test' }, showToast })).rejects.toThrow(
    'notebook'
  );
  await expect(
    action.execute({
      notebookId: 'explicit',
      payload: { information: 'test', agentType: 'unknown' },
      showToast,
    })
  ).rejects.toThrow('Unsupported');
  expect(localStorage.getItem('agent_memories_v2')).toBeNull();
});

it('shares context history with ordinary agent context updates without mutating previous snapshots', () => {
  AgentMemoryService.rememberInformation('selected', 'general', 'fact', 'general');
  const before = AgentMemoryService.getAgentMemory('selected', 'general')!;
  AgentMemoryService.updateCurrentContext('selected', 'general', { current_qa_id: 'qa' });
  const after = AgentMemoryService.getAgentMemory('selected', 'general')!;
  expect(before.situation_tracking.current_context).toHaveLength(1);
  expect(after.situation_tracking.current_context).toHaveLength(2);
  expect(after.situation_tracking.current_context?.[0].context_update).toEqual({
    current_qa_id: 'qa',
  });
});
