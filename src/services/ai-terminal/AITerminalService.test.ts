import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { useAIAgentStore } from '@Store/AIAgentStore';
import { aiTerminalService } from './AITerminalService';
import { StreamAction, registerStreamAction, clearStreamRegistry } from '../stream/actions/base';
import { ActionCommandParser } from '../stream/commands/ActionCommandParser';
import type { CommandContext } from './types';

const submitOperation = vi.hoisted(() => vi.fn());
const memory = vi.hoisted(() => ({
  prepareMemoryContextForBackend: vi.fn(),
  updateUserIntent: vi.fn(),
  recordOperationInteraction: vi.fn(),
}));
vi.mock('@Store/operatorStore', () => ({ default: { getState: () => ({ submitOperation }) } }));
vi.mock('@Store/codeStore', () => ({ default: { getState: vi.fn() } }));
vi.mock('@Services/agentMemoryService', () => ({ AgentMemoryService: memory }));
vi.mock('@Store/notebookStore', () => ({
  default: {
    getState: () => ({
      notebookId: 'book',
      currentCellId: null,
      currentPhaseId: null,
      currentStepIndex: 0,
      viewMode: 'create',
      setIsRightSidebarCollapsed: vi.fn(),
    }),
  },
}));

const context: CommandContext = {
  notebookId: 'book',
  currentCellId: null,
  currentPhaseId: null,
  currentStepIndex: 0,
  viewMode: 'create',
  actionsToShow: [],
  qasToShow: [],
  currentViewCells: [],
};
const execute = vi.fn();
class KnownAction extends StreamAction {
  execute(): void {
    execute();
  }
}
beforeEach(() => {
  vi.resetAllMocks();
  clearStreamRegistry();
  registerStreamAction('known_action', KnownAction);
  useAIAgentStore.setState({ actions: [], qaList: [] });
  memory.prepareMemoryContextForBackend.mockReturnValue({ memory: 'context' });
  submitOperation.mockResolvedValue({
    accepted: true,
    operationId: 'operation',
    completion: Promise.resolve(),
  });
});
afterEach(clearStreamRegistry);

it('routes unregistered slash commands to the backend with one authoritative history ID', async () => {
  const callbacks = { showToast: vi.fn(), setActiveView: vi.fn() };
  await aiTerminalService.processCommand('/custom_instruction do work', [], context, callbacks);
  expect(execute).not.toHaveBeenCalled();
  expect(callbacks.setActiveView).toHaveBeenCalledExactlyOnceWith('script');
  const records = useAIAgentStore.getState().actions;
  expect(records).toHaveLength(1);
  expect(useAIAgentStore.getState().qaList).toHaveLength(0);
  const id = records[0].id;
  expect(submitOperation).toHaveBeenCalledExactlyOnceWith(
    'book',
    expect.objectContaining({
      type: 'user_command',
      payload: expect.objectContaining({
        commandId: id,
        content: '/custom_instruction do work',
        memory: 'context',
      }),
    })
  );
  expect(memory.prepareMemoryContextForBackend).toHaveBeenCalledWith(
    'book',
    'command',
    expect.objectContaining({ command_id: id })
  );
  expect(memory.recordOperationInteraction).toHaveBeenCalledWith(
    'book',
    'command',
    'command_started',
    true,
    expect.objectContaining({ command_id: id })
  );
});

it.each(['/known_action', '/known-action'])(
  'executes registered command %s locally without backend dispatch',
  async (command) => {
    await aiTerminalService.processCommand(command, [], context, {
      showToast: vi.fn(),
      setActiveView: vi.fn(),
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(submitOperation).not.toHaveBeenCalled();
    expect(memory.prepareMemoryContextForBackend).not.toHaveBeenCalled();
  }
);

it.each(['/help', '/list', ' /known-action '])(
  'recognizes built-in and normalized commands %s',
  (command) => {
    expect(ActionCommandParser.isActionCommand(command)).toBe(true);
  }
);

it.each(['/unknown', '/', '', 'ordinary question'])(
  'does not classify %j as a registered action',
  (command) => {
    expect(ActionCommandParser.isActionCommand(command)).toBe(false);
  }
);

it.each(['/custom_instruction work', 'question'])(
  'returns false and removes provisional records when %s is refused',
  async (command) => {
    submitOperation.mockResolvedValue({ accepted: false, reason: 'busy', message: 'busy' });
    const accepted = await aiTerminalService.processCommand(command, [], context, {
      showToast: vi.fn(),
      setActiveView: vi.fn(),
    });
    expect(accepted).toBe(false);
    expect(useAIAgentStore.getState().qaList).toEqual([]);
    expect(useAIAgentStore.getState().actions).toEqual([]);
  }
);
it('returns true on admission without waiting for response stream completion', async () => {
  submitOperation.mockResolvedValue({
    accepted: true,
    operationId: 'accepted',
    completion: new Promise<void>(() => {}),
  });
  expect(
    await aiTerminalService.processCommand('question', [], context, {
      showToast: vi.fn(),
      setActiveView: vi.fn(),
    })
  ).toBe(true);
  expect(useAIAgentStore.getState().qaList).toHaveLength(1);
});
