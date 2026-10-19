import { beforeEach, expect, it, vi } from 'vitest';
const ports = vi.hoisted(() => ({
  finish: vi.fn(),
  update: vi.fn(),
  record: vi.fn(),
  notebookId: 'original',
}));
vi.mock('@/interfaces/globalUpdateInterface', () => ({
  default: { finishStreamingAnswer: ports.finish },
}));
vi.mock('@Store/notebookStore', () => ({
  default: { getState: () => ({ notebookId: ports.notebookId }) },
}));
vi.mock('@Store/AIAgentStore', () => ({ useAIAgentStore: { getState: () => ({ qaList: [] }) } }));
vi.mock('@Services/agentMemoryService', () => ({
  AgentMemoryService: {
    updateCurrentContext: ports.update,
    recordOperationInteraction: ports.record,
  },
}));
import { FinishStreamingAnswerAction } from './FinishStreamingAnswerAction';
import { qaStreamManager } from '../../managers/QAStreamManager';
beforeEach(() => {
  vi.resetAllMocks();
  ports.notebookId = 'original';
  qaStreamManager.clearStreamingQaId();
});

it.each(['next', 'original'])('does not clear a replacement stream for %s', async (nextId) => {
  qaStreamManager.setStreamingQaId('original');
  const pending = new FinishStreamingAnswerAction().execute({
    payload: { QId: 'original' },
    showToast: vi.fn(),
  });
  qaStreamManager.setStreamingQaId(nextId);
  const replacement = qaStreamManager.capture();
  await pending;
  expect(qaStreamManager.capture()).toBe(replacement);
});

it('does not clear an unrelated stream already active at admission', async () => {
  qaStreamManager.setStreamingQaId('other');
  await new FinishStreamingAnswerAction().execute({
    payload: { QId: 'original' },
    showToast: vi.fn(),
  });
  expect(qaStreamManager.getStreamingQaId()).toBe('other');
});

it('clears its own session and records completion against the captured notebook', async () => {
  qaStreamManager.setStreamingQaId('original');
  const pending = new FinishStreamingAnswerAction().execute({
    payload: { response: 'answer' },
    showToast: vi.fn(),
  });
  ports.notebookId = 'next';
  await pending;
  expect(ports.finish).toHaveBeenCalledWith('original', 'answer');
  expect(qaStreamManager.isStreaming()).toBe(false);
  expect(ports.update).toHaveBeenCalledWith(
    'original',
    'general',
    expect.objectContaining({ current_qa_id: 'original' })
  );
  expect(ports.record).toHaveBeenCalledWith(
    'original',
    'general',
    'qa_completed',
    true,
    expect.any(Object)
  );
});

it('honors an explicit notebook for memory publication', async () => {
  await new FinishStreamingAnswerAction().execute({
    notebookId: 'explicit',
    payload: { QId: 'qa', response: 'answer' },
    showToast: vi.fn(),
  });
  expect(ports.update).toHaveBeenCalledWith('explicit', 'general', expect.any(Object));
});

it('does not admit pre-cancelled completion', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    new FinishStreamingAnswerAction().execute({
      payload: { QId: 'qa' },
      showToast: vi.fn(),
      signal: controller.signal,
    })
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(ports.finish).not.toHaveBeenCalled();
});

it('suppresses completion side effects after cancellation during the answer update', async () => {
  const controller = new AbortController();
  qaStreamManager.setStreamingQaId('qa');
  ports.finish.mockImplementation(() => controller.abort());
  await expect(
    new FinishStreamingAnswerAction().execute({
      payload: { QId: 'qa', response: 'answer' },
      showToast: vi.fn(),
      signal: controller.signal,
    })
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(qaStreamManager.getStreamingQaId()).toBe('qa');
  expect(ports.update).not.toHaveBeenCalled();
  expect(ports.record).not.toHaveBeenCalled();
});

it('stops between memory publications when a context subscriber cancels', async () => {
  const controller = new AbortController();
  ports.update.mockImplementation(() => controller.abort());
  await expect(
    new FinishStreamingAnswerAction().execute({
      payload: { QId: 'qa', response: 'answer' },
      showToast: vi.fn(),
      signal: controller.signal,
    })
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(ports.update).toHaveBeenCalledOnce();
  expect(ports.record).not.toHaveBeenCalled();
});
