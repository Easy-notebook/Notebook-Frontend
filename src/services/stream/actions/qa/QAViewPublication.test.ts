import { beforeEach, expect, it, vi } from 'vitest';
const ports = vi.hoisted(() => ({
  cancel: vi.fn(),
  init: vi.fn(),
  append: vi.fn(),
  collapse: vi.fn(),
  view: vi.fn(),
  memory: vi.fn(),
  notebookId: 'original',
  collapsed: true,
  activeView: 'history',
}));
vi.mock('@/interfaces/globalUpdateInterface', () => ({
  default: { initStreamingAnswer: ports.init, addContentToAnswer: ports.append },
}));
vi.mock('@Store/notebookStore', () => ({
  default: {
    getState: () => ({
      notebookId: ports.notebookId,
      isRightSidebarCollapsed: ports.collapsed,
      setIsRightSidebarCollapsed: ports.collapse,
    }),
  },
}));
vi.mock('@Store/AIAgentStore', () => ({
  useAIAgentStore: {
    getState: () => ({
      activeView: ports.activeView,
      setActiveView: ports.view,
      cancelStreamingAnswer: ports.cancel,
    }),
  },
}));
vi.mock('@Services/agentMemoryService', () => ({
  AgentMemoryService: { updateCurrentContext: ports.memory },
}));
import { InitStreamingAnswerAction } from './InitStreamingAnswerAction';
import { AddContentToAnswerAction } from './AddContentToAnswerAction';
import { qaStreamManager } from '../../managers/QAStreamManager';
import { QAViewPresenter } from './QAViewPresenter';
beforeEach(() => {
  vi.resetAllMocks();
  ports.notebookId = 'original';
  ports.collapsed = true;
  ports.activeView = 'history';
  qaStreamManager.clearStreamingQaId();
});
it.each([InitStreamingAnswerAction, AddContentToAnswerAction])(
  'does not admit pre-cancelled %s',
  async (Action) => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      new Action().execute({
        payload: { QId: 'qa', content: 'text' },
        showToast: vi.fn(),
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(ports.init).not.toHaveBeenCalled();
    expect(ports.append).not.toHaveBeenCalled();
    expect(ports.collapse).not.toHaveBeenCalled();
  }
);
it.each([InitStreamingAnswerAction, AddContentToAnswerAction])(
  'does not publish after %s update cancels',
  async (Action) => {
    const controller = new AbortController();
    ports.init.mockImplementation(() => controller.abort());
    ports.append.mockImplementation(() => controller.abort());
    await expect(
      new Action().execute({
        payload: { QId: 'qa', content: 'text' },
        showToast: vi.fn(),
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(ports.collapse).not.toHaveBeenCalled();
    expect(ports.view).not.toHaveBeenCalled();
    expect(ports.memory).not.toHaveBeenCalled();
  }
);
it('stops after a sidebar subscriber cancels', async () => {
  const controller = new AbortController();
  ports.collapse.mockImplementation(() => controller.abort());
  await expect(QAViewPresenter.show(controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(ports.view).not.toHaveBeenCalled();
});
it('stops while the agent module is loading', async () => {
  const controller = new AbortController();
  const pending = QAViewPresenter.show(controller.signal);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(ports.view).not.toHaveBeenCalled();
});
it('skips redundant sidebar and view writes', async () => {
  ports.collapsed = false;
  ports.activeView = 'qa';
  await QAViewPresenter.show();
  expect(ports.collapse).not.toHaveBeenCalled();
  expect(ports.view).not.toHaveBeenCalled();
});
it('captures notebook memory ownership before initializing the answer', async () => {
  ports.init.mockImplementation(() => {
    ports.notebookId = 'next';
  });
  await new InitStreamingAnswerAction().execute({ payload: { QId: 'qa' }, showToast: vi.fn() });
  expect(qaStreamManager.getStreamingQaId()).toBe('qa');
  expect(ports.memory).toHaveBeenCalledWith(
    'original',
    'general',
    expect.objectContaining({ current_qa_id: 'qa' })
  );
});
it('does not record start memory after a view subscriber cancels', async () => {
  const controller = new AbortController();
  ports.view.mockImplementation(() => controller.abort());
  await expect(
    new InitStreamingAnswerAction().execute({
      payload: { QId: 'qa' },
      showToast: vi.fn(),
      signal: controller.signal,
    })
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(ports.memory).not.toHaveBeenCalled();
  expect(qaStreamManager.isStreaming()).toBe(false);
});

it('clears the cancelled start marker without clearing a later session', () => {
  const first = new AbortController();
  const second = new AbortController();
  qaStreamManager.setStreamingQaId('qa', first.signal);
  qaStreamManager.setStreamingQaId('qa', second.signal);
  const replacement = qaStreamManager.capture();
  first.abort();
  expect(qaStreamManager.capture()).toBe(replacement);
  second.abort();
  expect(qaStreamManager.isStreaming()).toBe(false);
});
it('detaches the stream cancellation listener when completion clears its session', () => {
  const controller = new AbortController();
  const remove = vi.spyOn(controller.signal, 'removeEventListener');
  qaStreamManager.setStreamingQaId('qa', controller.signal);
  qaStreamManager.clearStreamingQaId(qaStreamManager.capture());
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
});
