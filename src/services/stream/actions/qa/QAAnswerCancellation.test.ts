import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('@Store/notebookStore', () => ({
  default: { getState: () => ({ notebookId: 'book', isRightSidebarCollapsed: false }) },
}));
vi.mock('@Services/agentMemoryService', () => ({
  AgentMemoryService: { updateCurrentContext: vi.fn() },
}));
vi.mock('@/interfaces/globalUpdateInterface', async () => {
  const { useAIAgentStore } = await import('@Store/AIAgentStore');
  return {
    default: {
      initStreamingAnswer: (id: string) => useAIAgentStore.getState().initStreamingAnswer(id),
    },
  };
});
import { useAIAgentStore } from '@Store/AIAgentStore';
import { InitStreamingAnswerAction } from './InitStreamingAnswerAction';
import { qaStreamManager } from '../../managers/QAStreamManager';
const initial = useAIAgentStore.getState();
const state = () => useAIAgentStore.getState();
const start = (signal?: AbortSignal) =>
  new InitStreamingAnswerAction().execute({ payload: { QId: 'qa' }, showToast: vi.fn(), signal });
beforeEach(() => {
  useAIAgentStore.setState(initial, true);
  state().addQA({ id: 'qa', type: 'user', content: 'question', resolved: false, onProcess: true });
});
afterEach(() => {
  qaStreamManager.clearStreamingQaId();
  useAIAgentStore.setState(initial, true);
});
it('stops processing and timing while preserving partial content and unresolved status', async () => {
  const controller = new AbortController();
  await start(controller.signal);
  state().addContentToAnswer('qa', 'partial answer');
  controller.abort();
  expect(state().qaList.find((qa) => qa.id === 'qa')).toMatchObject({
    content: 'partial answer',
    resolved: false,
    onProcess: false,
    thinkingEndAtMs: expect.any(Number),
  });
  expect(state().qaList.find((qa) => qa.id === 'qa-[0]')).toMatchObject({
    content: 'question',
    resolved: false,
    onProcess: false,
  });
  expect(qaStreamManager.isStreaming()).toBe(false);
});
it('owns cancellation before initialization publishes to subscribers', async () => {
  const controller = new AbortController();
  const unsubscribe = useAIAgentStore.subscribe((next) => {
    if (next.qaList.some((qa) => qa.id === 'qa' && qa.type === 'assistant' && qa.onProcess))
      controller.abort();
  });
  try {
    await expect(start(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(state().qaList.find((qa) => qa.id === 'qa')?.onProcess).toBe(false);
    expect(qaStreamManager.isStreaming()).toBe(false);
  } finally {
    unsubscribe();
  }
});
it('does not stop a restarted answer when the old signal aborts', async () => {
  const old = new AbortController();
  const current = new AbortController();
  await start(old.signal);
  await start(current.signal);
  old.abort();
  expect(state().qaList.find((qa) => qa.id === 'qa')?.onProcess).toBe(true);
  current.abort();
  expect(state().qaList.find((qa) => qa.id === 'qa')?.onProcess).toBe(false);
});
it('does not alter a completed answer when interruption is repeated', async () => {
  await start();
  state().finishStreamingAnswer('qa', 'done');
  const completed = state().qaList;
  state().cancelStreamingAnswer('qa');
  expect(state().qaList).toBe(completed);
  expect(completed[0]).toMatchObject({ content: 'done', resolved: true, onProcess: false });
});

it('stops a replaced answer while allowing the new answer to stream', async () => {
  await start();
  state().addContentToAnswer('qa', 'partial');
  state().addQA({ id: 'next', type: 'user', content: 'next question', resolved: false });
  await new InitStreamingAnswerAction().execute({ payload: { QId: 'next' }, showToast: vi.fn() });
  expect(state().qaList.find((qa) => qa.id === 'qa')).toMatchObject({
    content: 'partial',
    onProcess: false,
    resolved: false,
  });
  expect(state().qaList.find((qa) => qa.id === 'next')).toMatchObject({
    type: 'assistant',
    onProcess: true,
  });
});

it('does not initialize an answer superseded synchronously during old-answer settlement', async () => {
  await start();
  state().addQA({ id: 'next', type: 'user', content: 'next question', resolved: false });
  state().addQA({ id: 'newest', type: 'user', content: 'newest question', resolved: false });
  let newest: Promise<void> | undefined;
  const unsubscribe = useAIAgentStore.subscribe((value) => {
    if (!newest && value.qaList.find((qa) => qa.id === 'qa')?.onProcess === false) {
      unsubscribe();
      newest = new InitStreamingAnswerAction().execute({
        payload: { QId: 'newest' },
        showToast: vi.fn(),
      });
    }
  });
  try {
    await new InitStreamingAnswerAction().execute({ payload: { QId: 'next' }, showToast: vi.fn() });
    await newest;
    expect(qaStreamManager.getStreamingQaId()).toBe('newest');
    expect(state().qaList.find((qa) => qa.id === 'next')).toMatchObject({
      type: 'user',
      content: 'next question',
    });
    expect(state().qaList.find((qa) => qa.id === 'newest')).toMatchObject({
      type: 'assistant',
      onProcess: true,
    });
  } finally {
    unsubscribe();
  }
});
