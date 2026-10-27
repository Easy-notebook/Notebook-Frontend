import { beforeEach, expect, it, vi } from 'vitest';
import type { StreamActionContext } from './types';
const ports = vi.hoisted(() => ({ execute: vi.fn(), addAction: vi.fn() }));
vi.mock('./actions', () => ({
  getStreamActionClass: () =>
    class {
      execute(context: StreamActionContext) {
        return ports.execute(context);
      }
    },
}));
vi.mock('@Store/AIAgentStore', () => ({
  useAIAgentStore: { getState: () => ({ addAction: ports.addAction }) },
}));
import { handleStreamResponse } from './StreamHandler';
beforeEach(() => vi.resetAllMocks());

it('passes the stream signal through to actions and records successful completion', async () => {
  const controller = new AbortController();
  const showToast = vi.fn();
  ports.execute.mockImplementation(async (context: StreamActionContext) => {
    expect(context.signal).toBe(controller.signal);
    expect(context.payload).toEqual({ content: 'test' });
    await context.showToast({ message: 'done', type: 'info' });
  });
  await handleStreamResponse(
    { type: 'test', data: { payload: { content: 'test' } } },
    showToast,
    controller.signal
  );
  expect(showToast).toHaveBeenCalledOnce();
  expect(ports.addAction).toHaveBeenCalledOnce();
});

it('rejects pre-cancelled streams before executing an action', async () => {
  const controller = new AbortController();
  controller.abort();
  const showToast = vi.fn();
  await expect(
    handleStreamResponse({ type: 'test' }, showToast, controller.signal)
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(ports.execute).not.toHaveBeenCalled();
  expect(ports.addAction).not.toHaveBeenCalled();
  expect(showToast).not.toHaveBeenCalled();
});

it.each(['resolve', 'reject', 'notify'] as const)(
  'suppresses stale %s publication after cancellation',
  async (outcome) => {
    const controller = new AbortController();
    const showToast = vi.fn();
    ports.execute.mockImplementation(async (context: StreamActionContext) => {
      controller.abort();
      if (outcome === 'reject') throw new Error('late failure');
      if (outcome === 'notify') await context.showToast({ message: 'late', type: 'info' });
    });
    await expect(
      handleStreamResponse({ type: 'test' }, showToast, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(showToast).not.toHaveBeenCalled();
    expect(ports.addAction).not.toHaveBeenCalled();
  }
);

it('checks ownership again after lazy history loading', async () => {
  const controller = new AbortController();
  const showToast = vi.fn();
  // The handler continuation begins history loading, then this queued callback cancels it.
  ports.execute.mockImplementation(() => {
    queueMicrotask(() => queueMicrotask(() => controller.abort()));
  });
  await expect(
    handleStreamResponse({ type: 'test' }, showToast, controller.signal)
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(ports.addAction).not.toHaveBeenCalled();
  expect(showToast).not.toHaveBeenCalled();
});

it('retains ordinary action failure reporting for active streams', async () => {
  ports.execute.mockRejectedValue(new Error('failure'));
  const showToast = vi.fn();
  await handleStreamResponse({ type: 'test' }, showToast);
  expect(showToast).toHaveBeenCalledWith({ message: '处理流式响应失败: failure', type: 'error' });
  expect(ports.addAction).not.toHaveBeenCalled();
});
