import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAIAgentStore } from './AIAgentStore';
const initial = useAIAgentStore.getState();
const state = () => useAIAgentStore.getState();
beforeEach(() => {
  useAIAgentStore.setState(initial, true);
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  state().addQA({
    id: 'qa',
    type: 'user',
    content: 'original question',
    resolved: false,
    attachedFiles: [{ id: 'attachment' }],
  });
});
afterEach(() => {
  useAIAgentStore.setState(initial, true);
  vi.useRealTimers();
});
it('retains one original question when restarting a completed answer', () => {
  state().initStreamingAnswer('qa');
  state().finishStreamingAnswer('qa', 'first answer');
  vi.setSystemTime(5000);
  state().initStreamingAnswer('qa');
  expect(state().qaList.map((qa) => qa.id)).toEqual(['qa', 'qa-[0]']);
  expect(state().qaList[1]).toMatchObject({
    type: 'user',
    content: 'original question',
    attachedFiles: [{ id: 'attachment' }],
  });
  expect(state().qaList[0]).toMatchObject({
    type: 'assistant',
    content: '',
    onProcess: true,
    resolved: false,
    thinkingStartAtMs: 5000,
  });
  expect(state().qaList[0].thinkingEndAtMs).toBeUndefined();
});
it('does not duplicate the question when initialization repeats during streaming', () => {
  state().initStreamingAnswer('qa');
  state().addContentToAnswer('qa', 'partial');
  state().initStreamingAnswer('qa');
  state().initStreamingAnswer('qa');
  expect(state().qaList).toHaveLength(2);
  expect(state().qaList[1].content).toBe('original question');
});
it('restarts an interrupted answer with an open timer', () => {
  state().initStreamingAnswer('qa');
  vi.setSystemTime(2000);
  state().cancelStreamingAnswer('qa');
  vi.setSystemTime(3000);
  state().initStreamingAnswer('qa');
  expect(state().qaList[0].thinkingStartAtMs).toBe(3000);
  expect(state().qaList[0].thinkingEndAtMs).toBeUndefined();
});
it('does not invent a user question from an existing standalone assistant answer', () => {
  state().updateQA('qa', { type: 'assistant', content: 'prior answer' });
  state().initStreamingAnswer('qa');
  expect(state().qaList.map((qa) => qa.id)).toEqual(['qa']);
  expect(state().qaList[0].content).toBe('');
});
it('leaves state and subscribers untouched for a missing question', () => {
  const before = state();
  const listener = vi.fn();
  const unsubscribe = useAIAgentStore.subscribe(listener);
  try {
    state().initStreamingAnswer('missing');
    expect(state()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  } finally {
    unsubscribe();
  }
});

it.each(['completed', 'interrupted'] as const)(
  'ignores late chunks and completion after %s',
  (phase) => {
    state().initStreamingAnswer('qa');
    state().addContentToAnswer('qa', 'original content');
    if (phase === 'completed') state().finishStreamingAnswer('qa');
    else state().cancelStreamingAnswer('qa');
    const settled = state();
    vi.setSystemTime(9000);
    expect(state().addContentToAnswer('qa', 'late chunk')).toBe(false);
    expect(state().finishStreamingAnswer('qa', 'late final')).toBe(false);
    expect(state()).toBe(settled);
    expect(state().qaList[0].resolved).toBe(phase === 'completed');
    state().initStreamingAnswer('qa');
    expect(state().addContentToAnswer('qa', 'new round')).toBe(true);
    expect(state().finishStreamingAnswer('qa')).toBe(true);
  }
);

it('preserves early content/final response support before an explicit initialization event', () => {
  expect(state().addContentToAnswer('qa', 'early')).toBe(true);
  expect(state().finishStreamingAnswer('qa')).toBe(true);
  expect(state().qaList[0].content).toBe('original questionearly');
});

it('does not emit updates for missing IDs or empty chunks', () => {
  const before = state();
  expect(state().addContentToAnswer('missing', 'chunk')).toBe(false);
  expect(state().finishStreamingAnswer('missing')).toBe(false);
  expect(state().addContentToAnswer('qa', '')).toBe(false);
  expect(state()).toBe(before);
});
