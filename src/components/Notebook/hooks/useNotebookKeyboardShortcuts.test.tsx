import { renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useNotebookKeyboardShortcuts } from './useNotebookKeyboardShortcuts';
const mocks = vi.hoisted(() => ({ command: vi.fn(), select: vi.fn(), current: vi.fn() }));
vi.mock('@Store/AIAgentStore', () => ({
  useAIAgentStore: () => ({ showCommandInput: false, setShowCommandInput: mocks.command }),
}));
vi.mock('@Store/notebookStore', () => ({
  default: {
    getState: () => ({
      cells: [
        { id: 'a', type: 'markdown' },
        { id: 'b', type: 'markdown' },
      ],
      currentCellId: 'a',
      setEditingCellId: mocks.select,
      setCurrentCell: mocks.current,
    }),
  },
}));
vi.mock('@Utils/logger', () => ({ uiLog: { debug: vi.fn() } }));
afterEach(() => vi.clearAllMocks());
it('leaves source arrows alone and navigates cells from the notebook surface', () => {
  setup('create');
  const editor = document.createElement('textarea');
  document.body.append(editor);
  const sourceArrow = new KeyboardEvent('keydown', {
    key: 'ArrowDown',
    bubbles: true,
    cancelable: true,
  });
  editor.dispatchEvent(sourceArrow);
  expect(sourceArrow.defaultPrevented).toBe(false);
  expect(mocks.select).not.toHaveBeenCalled();
  editor.remove();
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    })
  );
  expect(mocks.select).toHaveBeenCalledExactlyOnceWith('b');
});
function setup(viewMode = 'step') {
  const props = {
    viewMode,
    currentStepIndex: 0,
    currentPhaseId: null,
    handlePreviousStep: vi.fn(),
    handleNextStep: vi.fn(),
    handlePreviousPhase: vi.fn(),
    handleNextPhase: vi.fn(),
    handleModeChange: vi.fn(),
    getTotalSteps: () => 3,
  };
  renderHook(() => useNotebookKeyboardShortcuts(props));
  return props;
}

it.each(['textarea', 'input', 'select', 'div[contenteditable]', 'dialog'])(
  'leaves shortcuts inside %s to their owner',
  (kind) => {
    const props = setup();
    const element = document.createElement(kind === 'div[contenteditable]' ? 'div' : kind);
    if (kind === 'div[contenteditable]') element.setAttribute('contenteditable', 'true');
    document.body.append(element);
    for (const key of ['ArrowRight', '/', 'Control']) {
      element.dispatchEvent(
        new KeyboardEvent('keydown', {
          key,
          altKey: true,
          ctrlKey: key === 'Control',
          bubbles: true,
          cancelable: true,
        })
      );
    }
    expect(props.handleNextStep).not.toHaveBeenCalled();
    expect(props.handleModeChange).not.toHaveBeenCalled();
    expect(mocks.command).not.toHaveBeenCalled();
    element.remove();
  }
);

it('respects composition and already handled events while keeping normal navigation', () => {
  const props = setup();
  const handled = new KeyboardEvent('keydown', {
    key: 'ArrowRight',
    altKey: true,
    bubbles: true,
    cancelable: true,
  });
  handled.preventDefault();
  document.body.dispatchEvent(handled);
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      altKey: true,
      isComposing: true,
      bubbles: true,
    })
  );
  expect(props.handleNextStep).not.toHaveBeenCalled();
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true })
  );
  expect(props.handleNextStep).toHaveBeenCalledOnce();
});

it('does not toggle modes on arbitrary Alt+Ctrl characters or key repeats', () => {
  const props = setup('create');
  for (const event of [{ key: 'x' }, { key: 'ArrowRight' }, { key: 'Control', repeat: true }])
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { ...event, altKey: true, ctrlKey: true, bubbles: true })
    );
  expect(props.handleModeChange).not.toHaveBeenCalled();
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Control', altKey: true, ctrlKey: true, bubbles: true })
  );
  expect(props.handleModeChange).toHaveBeenCalledWith('step');
});
