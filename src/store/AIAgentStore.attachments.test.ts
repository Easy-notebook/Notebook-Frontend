import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAIAgentStore } from './AIAgentStore';
import { AttachmentDraft } from '@Services/ai-terminal/AttachmentDraft';
import { EVENT_TYPES } from './models/agent';
const initial = useAIAgentStore.getState();
const drafts: AttachmentDraft[] = [];
let revoke = vi.fn();
const state = () => useAIAgentStore.getState();
beforeEach(() => {
  revoke = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static revokeObjectURL = revoke;
    }
  );
});
afterEach(() => {
  drafts.splice(0).forEach((draft) => draft.detach());
  useAIAgentStore.setState(initial, true);
  vi.unstubAllGlobals();
});
async function draftWith(...ids: string[]) {
  const draft = new AttachmentDraft();
  drafts.push(draft);
  await draft.upload(
    [new File([], 'a.txt')],
    async () =>
      ids.map((id) => ({
        id,
        name: `${id}.txt`,
        size: 0,
        type: 'text/plain',
        url: `blob:${id}`,
        file: new File([], `${id}.txt`),
      })),
    vi.fn()
  );
  return draft;
}
function addQA(id: string, attachedFiles: unknown[]) {
  state().addQA({ id, type: 'user', content: 'question', resolved: false, attachedFiles });
}
it('retains a shared attachment until both QA and action records are removed', async () => {
  const draft = await draftWith('a');
  const submission = draft.beginSubmission();
  addQA('qa', submission.files);
  const action = state().addAction({
    type: EVENT_TYPES.USER_NEW_INSTRUCTION,
    content: 'command',
    result: '',
    relatedQAIds: [],
    cellId: null,
    viewMode: 'create',
    attachedFiles: submission.files,
  });
  submission.finish(true);
  draft.detach();
  state().removeQA('qa');
  expect(revoke).not.toHaveBeenCalled();
  state().removeAction(action);
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:a');
});
it('keeps a stream-created QA copy alive after removing the original record', async () => {
  const draft = await draftWith('a');
  const submission = draft.beginSubmission();
  addQA('qa', submission.files);
  submission.finish(true);
  state().initStreamingAnswer('qa');
  state().removeQA('qa');
  expect(revoke).not.toHaveBeenCalled();
  state().removeQA('qa-[0]');
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:a');
});
it('reconciles attachment replacement and bulk clearing', async () => {
  const draft = await draftWith('a', 'b');
  const submission = draft.beginSubmission();
  addQA('qa', [submission.files[0]]);
  state().updateQA('qa', { attachedFiles: [submission.files[1]] });
  submission.finish(true);
  expect(revoke.mock.calls).toEqual([['blob:a']]);
  useAIAgentStore.setState({ actions: [], qaList: [] });
  expect(revoke.mock.calls).toEqual([['blob:a'], ['blob:b']]);
});
it('does not release a removed record while a failed submission still retains the draft', async () => {
  const draft = await draftWith('a');
  const submission = draft.beginSubmission();
  addQA('qa', submission.files);
  submission.finish(false);
  state().removeQA('qa');
  expect(revoke).not.toHaveBeenCalled();
  draft.remove('a');
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:a');
});
it('does not leak when a subscriber removes a newly created record before submission finishes', async () => {
  const draft = await draftWith('a');
  const submission = draft.beginSubmission();
  const unsubscribe = useAIAgentStore.subscribe((next) => {
    if (next.qaList.some((qa) => qa.id === 'qa')) state().removeQA('qa');
  });
  try {
    addQA('qa', submission.files);
  } finally {
    unsubscribe();
  }
  expect(revoke).not.toHaveBeenCalled();
  submission.finish(true);
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:a');
});
it('does not take ownership of external or unmanaged URLs', () => {
  addQA('qa', [
    { url: 'blob:external-owner' },
    { url: 'https://example.com/image.png' },
    null,
    'invalid',
  ]);
  state().removeQA('qa');
  expect(revoke).not.toHaveBeenCalled();
});
it('retains attachments across unrelated record updates and releases on direct state replacement', async () => {
  const draft = await draftWith('a');
  const submission = draft.beginSubmission();
  addQA('qa', submission.files);
  submission.finish(true);
  state().updateQA('qa', { content: 'updated' });
  state().setQAProcess('qa', true);
  expect(revoke).not.toHaveBeenCalled();
  useAIAgentStore.setState({ ...state(), qaList: [] }, true);
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:a');
});
