import { act, renderHook } from '@testing-library/react';
import type { ChangeEvent } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({
  create: vi.fn(),
  navigate: vi.fn(),
  toast: vi.fn(),
  setError: vi.fn(),
  setState: vi.fn(),
  addCell: vi.fn(),
  clearCells: vi.fn(),
  setNotebookId: vi.fn(),
}));
vi.mock('@Store/notebookStore', () => ({
  default: Object.assign(
    () => ({
      setNotebookId: io.setNotebookId,
      addCell: io.addCell,
      clearCells: io.clearCells,
      setCurrentPhase: vi.fn(),
      setCurrentStepIndex: vi.fn(),
      setViewMode: vi.fn(),
      setCurrentRunningPhaseId: vi.fn(),
      setError: io.setError,
    }),
    { setState: io.setState }
  ),
}));
vi.mock('@Store/routeStore', () => ({
  default: { getState: () => ({ navigateToWorkspace: io.navigate }) },
}));
vi.mock('@/components/UI/Toast', () => ({ useToast: () => ({ toast: io.toast }) }));
vi.mock('@Services/notebook/NotebookCreation', () => ({
  NotebookCreation: class {
    create = io.create;
  },
}));
vi.mock('@Services/notebook/NotebookLifecycleService', () => ({ NotebookLifecycleService: {} }));
vi.mock('@Utils/logger', () => ({ fileLog: { error: vi.fn() } }));

import useImportNotebook from './import4JsonOrJupyterNotebook';

beforeEach(() => {
  vi.clearAllMocks();
  io.create.mockResolvedValue('imported-id');
});

async function importFile(content: string, name = 'session.TXT') {
  const { result } = renderHook(() => useImportNotebook());
  const input = {
    files: [new File([content], name, { type: 'text/plain' })],
    value: 'session.TXT',
  };
  await act(() =>
    result.current.handleImport({ target: input } as unknown as ChangeEvent<HTMLInputElement>)
  );
  return input;
}

it('reads a text file, saves all turns, then opens the new notebook', async () => {
  const input = await importFile('❯ Hello\n⏺ Hi\n⏺ Bash(ls)\n  ⎿  file.txt');
  expect(io.create).toHaveBeenCalledWith(
    'session',
    expect.arrayContaining([
      expect.objectContaining({ content: '## Hello', type: 'markdown' }),
      expect.objectContaining({ content: 'Hi', type: 'markdown' }),
    ])
  );
  expect(io.navigate).toHaveBeenCalledWith('imported-id');
  expect(io.create.mock.invocationCallOrder[0]).toBeLessThan(
    io.navigate.mock.invocationCallOrder[0]
  );
  expect(io.clearCells).not.toHaveBeenCalled();
  expect(io.setNotebookId).not.toHaveBeenCalled();
  expect(io.setState).not.toHaveBeenCalled();
  expect(input.value).toBe('');
});

it('rejects unrelated text without creating or navigating and allows selecting it again', async () => {
  const input = await importFile('ordinary text');
  expect(io.create).not.toHaveBeenCalled();
  expect(io.navigate).not.toHaveBeenCalled();
  expect(io.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  expect(input.value).toBe('');
});

it('does not navigate or clear the current notebook when saving fails', async () => {
  io.create.mockRejectedValueOnce(new Error('storage full'));
  await importFile('❯ Hello\n⏺ Hi');
  expect(io.navigate).not.toHaveBeenCalled();
  expect(io.clearCells).not.toHaveBeenCalled();
  expect(io.setState).not.toHaveBeenCalled();
  expect(io.toast).toHaveBeenCalledWith(
    expect.objectContaining({ description: 'storage full', variant: 'destructive' })
  );
});

it('reopens a converted easynb without splitting fenced headings or losing transcript metadata', async () => {
  const cell = {
    id: 'original',
    type: 'markdown',
    content: 'Check results',
    metadata: { transcriptFormat: 2, transcriptRole: 'user', turnIndex: 1 },
  };
  await importFile(JSON.stringify({ title: 'Converted', cells: [cell] }), 'converted.easynb');
  expect(io.create).toHaveBeenCalledWith('Converted', [
    expect.objectContaining({ ...cell, id: expect.not.stringMatching(/^original$/) }),
  ]);
  expect(io.navigate).toHaveBeenCalledWith('imported-id');
});
