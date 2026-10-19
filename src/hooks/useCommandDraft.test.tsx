import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useCommandDraft } from './useCommandDraft';
import { useAIAgentStore } from '@Store/AIAgentStore';
it('preserves initial notebook admission, resets notebook changes and ignores old completion under StrictMode', async () => {
  const hook = renderHook(({ id }) => useCommandDraft(id), {
    initialProps: { id: null as string | null },
    wrapper: StrictMode,
  });
  act(() => hook.result.current.setInput('question'));
  let finish!: (accepted: boolean) => void;
  let run!: Promise<void>;
  act(() => {
    run = hook.result.current.commandDraft.submit(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      vi.fn()
    );
  });
  expect(useAIAgentStore.getState().isLoading).toBe(true);
  hook.rerender({ id: 'created' });
  expect(hook.result.current.input).toBe('question');
  hook.rerender({ id: 'other' });
  expect(hook.result.current.input).toBe('');
  act(() => hook.result.current.setInput('new notebook question'));
  await act(async () => {
    finish(true);
    await run;
  });
  expect(hook.result.current.input).toBe('new notebook question');
  expect(useAIAgentStore.getState().isLoading).toBe(false);
  hook.unmount();
});
