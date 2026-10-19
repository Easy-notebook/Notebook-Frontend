import { beforeEach, expect, it, vi } from 'vitest';
import type { Cell } from '@Store/models/cell';
import type { ExecutionStep } from '@Store/models';
import { CodeOutputSubmissionService } from './CodeOutputSubmissionService';
import { SendCodeOutputAction } from '@/components/Scenario/Workflow/actions/code/SendCodeOutputAction';
import { sendCurrentCellExecuteCodeResult } from '@Store/autoActions';

const ports = vi.hoisted(() => ({
  getCurrentCell: vi.fn<() => Cell | undefined>(),
  submitOperation: vi.fn(),
  executeCell: vi.fn(),
}));
vi.mock('@Store/notebookStore', () => ({
  default: { getState: () => ({ notebookId: 'notebook-a', getCurrentCell: ports.getCurrentCell }) },
}));
vi.mock('@Store/operatorStore', () => ({ default: { getState: () => ports } }));
vi.mock('@Store/codeStore', () => ({ default: { getState: () => ports } }));

beforeEach(() => {
  vi.resetAllMocks();
  ports.getCurrentCell.mockReturnValue({
    id: 'cell-a',
    type: 'code',
    content: 'print(1)',
    outputs: [{ type: 'text', content: '1' }],
  });
  ports.submitOperation.mockResolvedValue({
    accepted: true,
    operationId: 'op',
    completion: new Promise(() => {}),
  });
  ports.executeCell.mockResolvedValue({ success: true });
});

it('waits for admission and succeeds without waiting for stream completion', async () => {
  let accept!: (receipt: unknown) => void;
  ports.submitOperation.mockReturnValue(
    new Promise((resolve) => {
      accept = resolve;
    })
  );
  const completed = vi.fn();
  const pending = new SendCodeOutputAction({}).execute({} as ExecutionStep).then(completed);
  await Promise.resolve();
  expect(completed).not.toHaveBeenCalled();
  expect(ports.submitOperation).toHaveBeenCalledWith('notebook-a', {
    type: 'code_output',
    payload: {
      executeResult: [{ type: 'text', content: '1' }],
      executeCode: 'print(1)',
      cellId: 'cell-a',
      description: undefined,
    },
  });
  accept({ accepted: true, operationId: 'op', completion: new Promise(() => {}) });
  await pending;
  expect(completed).toHaveBeenCalledWith({ success: true });
});

it.each(['busy', 'failed', 'cancelled'])('reports %s admission as failure', async (reason) => {
  ports.submitOperation.mockResolvedValue({ accepted: false, reason, message: reason });
  await expect(new SendCodeOutputAction({}).execute({} as ExecutionStep)).resolves.toEqual({
    success: false,
    error: reason,
  });
});

it('reports unexpected submission rejection without leaving an unhandled request', async () => {
  ports.submitOperation.mockRejectedValue(new Error('connection lost'));
  await expect(CodeOutputSubmissionService.submitCurrentCell()).resolves.toEqual({
    success: false,
    error: 'connection lost',
  });
});

it('rejects missing and non-code selections before dispatch', async () => {
  ports.getCurrentCell.mockReturnValue(undefined);
  await expect(CodeOutputSubmissionService.submitCurrentCell()).resolves.toEqual({
    success: false,
    error: 'No current cell',
  });
  ports.getCurrentCell.mockReturnValue({ id: 'text', type: 'markdown', content: 'hello' });
  await expect(CodeOutputSubmissionService.submitCurrentCell()).resolves.toEqual({
    success: false,
    error: 'Not a code cell',
  });
  expect(ports.submitOperation).not.toHaveBeenCalled();
  expect(ports.executeCell).not.toHaveBeenCalled();
});

it('prepares a missing output once without pretending that it was submitted', async () => {
  ports.getCurrentCell.mockReturnValue({ id: 'cell-a', type: 'code', content: 'pass' });
  await expect(CodeOutputSubmissionService.submitCurrentCell()).resolves.toEqual({
    success: false,
    error: 'No execute result',
  });
  expect(ports.executeCell).toHaveBeenCalledExactlyOnceWith('cell-a');
  expect(ports.submitOperation).not.toHaveBeenCalled();
});

it('shares submission policy with the public void-returning adapter and permits empty output', async () => {
  ports.getCurrentCell.mockReturnValue({
    id: 'silent',
    type: 'code',
    content: 'pass',
    outputs: [],
  });
  expect(sendCurrentCellExecuteCodeResult()).toBeUndefined();
  expect(ports.submitOperation).toHaveBeenCalledExactlyOnceWith('notebook-a', {
    type: 'code_output',
    payload: { executeResult: [], executeCode: 'pass', cellId: 'silent', description: undefined },
  });
  expect(ports.executeCell).not.toHaveBeenCalled();
});
