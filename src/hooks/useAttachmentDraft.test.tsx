import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAttachmentDraft } from './useAttachmentDraft';
afterEach(() => vi.unstubAllGlobals());
it('preserves initial notebook admission, resets notebook changes, and releases on unmount under StrictMode', async () => {
  const revoke = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static revokeObjectURL = revoke;
    }
  );
  const hook = renderHook(({ id }) => useAttachmentDraft(id), {
    initialProps: { id: null as string | null },
    wrapper: StrictMode,
  });
  const file = {
    id: 'a',
    name: 'a.txt',
    size: 1,
    type: 'text/plain',
    url: 'blob:a',
    file: new File(['a'], 'a.txt'),
  };
  await act(async () => {
    await hook.result.current.draft.upload([file.file], async () => [file], vi.fn());
  });
  hook.rerender({ id: 'created' });
  expect(hook.result.current.files).toHaveLength(1);
  hook.rerender({ id: 'other' });
  expect(hook.result.current.files).toHaveLength(0);
  expect(revoke).toHaveBeenCalledWith('blob:a');
  await act(async () => {
    await hook.result.current.draft.upload(
      [file.file],
      async () => [{ ...file, id: 'b', url: 'blob:b' }],
      vi.fn()
    );
  });
  hook.unmount();
  expect(revoke.mock.calls).toEqual([['blob:a'], ['blob:b']]);
});
