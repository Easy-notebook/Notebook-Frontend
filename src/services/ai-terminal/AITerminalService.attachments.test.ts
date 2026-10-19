import { beforeEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({ events: [] as string[], handled: false }));
vi.mock('./AttachmentUploadService', () => ({
  attachmentUploadService: { MAX_FILE_SIZE: 1, ALLOWED_EXTENSIONS: [], uploadFiles: vi.fn() },
}));
vi.mock('@Store/AIAgentStore', () => ({
  useAIAgentStore: {
    getState: () => ({
      addQA: () => {
        io.events.push('record');
        return 'qa';
      },
      addAction: () => {
        io.events.push('record');
        return 'action';
      },
    }),
  },
}));
vi.mock('@Store/operatorStore', () => ({
  default: { getState: () => ({ sendOperation: vi.fn() }) },
}));
vi.mock('@Services/agentMemoryService', () => ({
  AgentMemoryService: {
    prepareMemoryContextForBackend: () => {
      io.events.push('memory');
      throw new Error('memory failed');
    },
  },
}));
vi.mock('@Services/stream/commands', () => ({
  ActionCommandHandler: { handleCommand: async () => io.handled },
}));
import { aiTerminalService } from './AITerminalService';
const context = {
  notebookId: 'owner',
  currentCellId: null,
  viewMode: 'create',
  currentPhaseId: null,
  currentStepIndex: 0,
  actionsToShow: [],
  qasToShow: [],
  currentViewCells: [],
};
beforeEach(() => {
  io.events = [];
  io.handled = false;
});
it.each(['question', '/custom'])(
  'transfers attachment ownership after recording %s even if later processing fails',
  async (command) => {
    await expect(
      aiTerminalService.processCommand(command, [], context, {
        showToast: vi.fn(),
        setActiveView: vi.fn(),
        onAttachmentsCommitted: () => {
          io.events.push('transfer');
        },
      })
    ).rejects.toThrow('memory failed');
    expect(io.events.slice(0, 2)).toEqual(['record', 'transfer']);
    expect(io.events[io.events.length - 1]).toBe('memory');
    expect(io.events.filter((event) => event === 'transfer')).toHaveLength(1);
  }
);
it('does not transfer attachments when a built-in command handles the input without a message record', async () => {
  io.handled = true;
  const transfer = vi.fn();
  expect(
    await aiTerminalService.processCommand('/built-in', [], context, {
      showToast: vi.fn(),
      setActiveView: vi.fn(),
      onAttachmentsCommitted: transfer,
    })
  ).toBe(true);
  expect(transfer).not.toHaveBeenCalled();
  expect(io.events).toEqual([]);
});
