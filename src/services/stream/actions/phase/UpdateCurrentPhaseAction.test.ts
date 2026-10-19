import { afterEach, expect, it, vi } from 'vitest';
import useStore from '@Store/notebookStore';
import { UpdateCurrentPhaseAction } from './UpdateCurrentPhaseAction';

const initial = useStore.getState();
afterEach(() => useStore.setState(initial, true));

it('publishes phase selection and step reset atomically exactly once', async () => {
  useStore.setState({ notebookId: 'a', currentPhaseId: 'old', currentStepIndex: 5 });
  const publications = vi.fn();
  const stop = useStore.subscribe(publications);
  const showToast = vi.fn();
  try {
    await new UpdateCurrentPhaseAction().execute({
      notebookId: 'a',
      payload: { phaseId: 'new' },
      showToast,
    });
    expect(publications).toHaveBeenCalledOnce();
    expect(publications.mock.calls[0][0]).toMatchObject({
      currentPhaseId: 'new',
      currentStepIndex: 0,
    });
    expect(showToast).toHaveBeenCalledOnce();
  } finally {
    stop();
  }
});

it('does not reset a new notebook step after yielding', async () => {
  useStore.setState({ notebookId: 'a', currentStepIndex: 5 });
  const pending = new UpdateCurrentPhaseAction().execute({
    payload: { phaseId: 'new' },
    showToast: vi.fn(),
  });
  useStore.setState({ notebookId: 'b', currentPhaseId: 'other', currentStepIndex: 7 });
  await pending;
  expect(useStore.getState()).toMatchObject({
    notebookId: 'b',
    currentPhaseId: 'other',
    currentStepIndex: 7,
  });
});

it('ignores commands captured for another notebook', async () => {
  useStore.setState({ notebookId: 'b', currentPhaseId: 'kept', currentStepIndex: 3 });
  const showToast = vi.fn();
  await new UpdateCurrentPhaseAction().execute({
    notebookId: 'a',
    payload: { phaseId: 'new' },
    showToast,
  });
  expect(useStore.getState()).toMatchObject({ currentPhaseId: 'kept', currentStepIndex: 3 });
  expect(showToast).not.toHaveBeenCalled();
});

it('does not announce selection after a synchronous subscriber changes the notebook', async () => {
  useStore.setState({ notebookId: 'a', currentPhaseId: 'old', currentStepIndex: 5 });
  const showToast = vi.fn();
  const stop = useStore.subscribe((state) => {
    if (state.notebookId === 'a' && state.currentPhaseId === 'new') {
      useStore.setState({ notebookId: 'b', currentPhaseId: 'other', currentStepIndex: 9 });
    }
  });
  try {
    await new UpdateCurrentPhaseAction().execute({ payload: { phaseId: 'new' }, showToast });
    expect(useStore.getState().currentStepIndex).toBe(9);
    expect(showToast).not.toHaveBeenCalled();
  } finally {
    stop();
  }
});
