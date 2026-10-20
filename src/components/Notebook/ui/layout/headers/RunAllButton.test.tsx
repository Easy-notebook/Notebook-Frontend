import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({ stop: vi.fn() }));
vi.mock('@Store/codeStore', async () => {
  const { create } = await import('zustand');
  return { default: create(() => ({ batchExecution: 'idle', stopBatchExecution: io.stop })) };
});
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
import useCodeStore from '@Store/codeStore';
import { RunAllButton } from './RunAllButton';
beforeEach(() => {
  io.stop.mockClear();
  useCodeStore.setState({ batchExecution: 'idle' });
});
it('offers a batch stop and disables repeated stop while waiting for the current cell', () => {
  useCodeStore.setState({ batchExecution: 'running' });
  const run = vi.fn();
  render(<RunAllButton onRunAll={run} isExecuting empty={false} />);
  fireEvent.click(screen.getByRole('button'));
  expect(io.stop).toHaveBeenCalledOnce();
  expect(run).not.toHaveBeenCalled();
  act(() => useCodeStore.setState({ batchExecution: 'stopping' }));
  expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
  expect(screen.getByText('fileOperations.stoppingRunAll')).toBeTruthy();
});
it('does not offer batch cancellation for a separately running workflow', () => {
  render(<RunAllButton onRunAll={vi.fn()} isExecuting empty={false} />);
  expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
});
