import { afterEach, expect, it } from 'vitest';
import useStore from '@Store/notebookStore';
import { ActionCommandParser } from '../commands/ActionCommandParser';
// Exercise the same complete registration catalog used by production dispatch.
import './index';

const initial = useStore.getState();
afterEach(() =>
  useStore.setState({
    cells: initial.cells,
    currentCellId: initial.currentCellId,
    currentRunningPhaseId: initial.currentRunningPhaseId,
    currentStepIndex: initial.currentStepIndex,
  })
);

it('selects an existing cell through the registered command using the actual store API', async () => {
  useStore.setState({
    cells: [{ id: 'target', type: 'markdown', content: 'text' }],
    currentCellId: null,
  });
  await expect(
    ActionCommandParser.executeActionCommand('/set_current_cell target', {})
  ).resolves.toMatchObject({ success: true });
  expect(useStore.getState().currentCellId).toBe('target');
});

it('preserves cell selection when a command names a nonexistent cell', async () => {
  useStore.setState({
    cells: [{ id: 'kept', type: 'markdown', content: 'text' }],
    currentCellId: 'kept',
  });
  await ActionCommandParser.executeActionCommand('/set_current_cell missing', {});
  expect(useStore.getState().currentCellId).toBe('kept');
});

it('sets the running phase through the registered action and actual update interface', async () => {
  useStore.setState({ currentRunningPhaseId: null });
  await expect(
    ActionCommandParser.executeActionCommand('/set_running_phase --phaseId phase-a', {})
  ).resolves.toMatchObject({ success: true });
  expect(useStore.getState().currentRunningPhaseId).toBe('phase-a');
});

it.each([0, 2])('uses the existing positional step-index protocol for %i', async (index) => {
  useStore.setState({ currentStepIndex: 9 });
  await expect(
    ActionCommandParser.executeActionCommand(`/update_current_step_index ${index}`, {})
  ).resolves.toMatchObject({ success: true });
  expect(useStore.getState().currentStepIndex).toBe(index);
});
