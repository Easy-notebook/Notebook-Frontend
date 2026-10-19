import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAttachmentDraft } from './useAttachmentDraft';
import { useAIAgentStore } from '@Store/AIAgentStore';
const initial = useAIAgentStore.getState();
const revoke = vi.fn();
const attachment = (id: string) => ({
  id,
  name: `${id}.txt`,
  size: 0,
  type: 'text/plain',
  url: `blob:${id}`,
  file: new File([], `${id}.txt`),
});
beforeEach(() => {
  revoke.mockReset();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static revokeObjectURL = revoke;
    }
  );
});
afterEach(() => {
  useAIAgentStore.setState(initial, true);
  vi.unstubAllGlobals();
});
it('retains submitted controlled attachments through draft clearing and unmount until record removal', () => {
  const hook = renderHook(() => useAttachmentDraft('notebook'), { wrapper: StrictMode });
  const file = attachment('record');
  act(() => hook.result.current.draft.replaceFiles([file]));
  act(() => {
    useAIAgentStore.getState().addQA({
      id: 'qa-controlled',
      type: 'user',
      content: 'question',
      resolved: false,
      attachedFiles: hook.result.current.files,
    });
    hook.result.current.draft.replaceFiles([]);
  });
  hook.unmount();
  expect(revoke).not.toHaveBeenCalled();
  useAIAgentStore.getState().removeQA('qa-controlled');
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:record');
});
it('releases a replaced batch and current draft on notebook switch, while preserving initial admission', () => {
  const hook = renderHook(({ id }) => useAttachmentDraft(id), {
    initialProps: { id: null as string | null },
    wrapper: StrictMode,
  });
  act(() => hook.result.current.draft.replaceFiles([attachment('first')]));
  hook.rerender({ id: 'created' });
  expect(hook.result.current.files).toHaveLength(1);
  act(() => hook.result.current.draft.replaceFiles([attachment('next')]));
  expect(revoke.mock.calls).toEqual([['blob:first']]);
  hook.rerender({ id: 'other' });
  expect(hook.result.current.files).toEqual([]);
  expect(revoke.mock.calls).toEqual([['blob:first'], ['blob:next']]);
  hook.unmount();
  expect(revoke).toHaveBeenCalledTimes(2);
});
it('retains a failed submission draft after its QA is removed, then releases on unmount', () => {
  const hook = renderHook(() => useAttachmentDraft('notebook'), { wrapper: StrictMode });
  act(() => hook.result.current.draft.replaceFiles([attachment('retry')]));
  useAIAgentStore.getState().addQA({
    id: 'qa-failed',
    type: 'user',
    content: 'question',
    resolved: false,
    attachedFiles: hook.result.current.files,
  });
  useAIAgentStore.getState().removeQA('qa-failed');
  expect(revoke).not.toHaveBeenCalled();
  expect(hook.result.current.files).toHaveLength(1);
  hook.unmount();
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:retry');
});
