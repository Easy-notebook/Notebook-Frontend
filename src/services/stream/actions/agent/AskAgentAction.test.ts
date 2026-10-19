import { beforeEach, expect, it, vi } from 'vitest';
import { useAIAgentStore } from '@Store/AIAgentStore';
import { AskAgentAction } from './AskAgentAction';
import type { StreamPayload } from '../../types';

beforeEach(() => useAIAgentStore.setState({ qaList: [] }));

it('creates a complete pending QA through the real store API before notification', async () => {
  const showToast = vi.fn(async () => {
    expect(useAIAgentStore.getState().qaList).toHaveLength(1);
  });
  await new AskAgentAction().execute({
    payload: { question: 'Explain this result', agentType: 'analysis' },
    showToast,
  });
  expect(useAIAgentStore.getState().qaList[0]).toMatchObject({
    id: expect.any(String),
    timestamp: expect.any(String),
    type: 'user',
    content: 'Explain this result',
    agentType: 'analysis',
    resolved: false,
    onProcess: true,
  });
  expect(showToast).toHaveBeenCalledExactlyOnceWith({
    message: '正在请求 analysis Agent 帮助...',
    type: 'info',
  });
});

it('preserves the general-agent default and ignores absent questions', async () => {
  const showToast = vi.fn().mockResolvedValue(undefined);
  const action = new AskAgentAction();
  await action.execute({ payload: {}, showToast });
  expect(useAIAgentStore.getState().qaList).toHaveLength(0);
  expect(showToast).not.toHaveBeenCalled();
  await action.execute({ payload: { question: 'Help' }, showToast });
  expect(useAIAgentStore.getState().qaList[0].agentType).toBe('general');
});

it.each([{ question: { text: 'bad' } }, { question: 'Help', agentType: 12 }])(
  'rejects malformed wire data before creating a QA: %j',
  async (payload) => {
    const showToast = vi.fn();
    await expect(
      new AskAgentAction().execute({ payload: payload as unknown as StreamPayload, showToast })
    ).rejects.toThrow('must be a string');
    expect(useAIAgentStore.getState().qaList).toHaveLength(0);
    expect(showToast).not.toHaveBeenCalled();
  }
);

it('does not misreport creation failure or duplicate a request when notification fails', async () => {
  const showToast = vi.fn().mockRejectedValue(new Error('notification unavailable'));
  await expect(
    new AskAgentAction().execute({ payload: { question: 'Help' }, showToast })
  ).rejects.toThrow('notification unavailable');
  expect(useAIAgentStore.getState().qaList).toHaveLength(1);
  expect(showToast).toHaveBeenCalledTimes(1);
});
