import { expect, it } from 'vitest';
import { DraftPlayback } from './DraftPlayback';
it('reveals Unicode incrementally, preserves the visible prefix on appended checkpoints, and settles only at the end', async () => {
  const playback = new DraftPlayback();
  playback.setTarget('标题🙂后文', true);
  expect(playback.text).toBe('');
  playback.advance(50);
  expect(playback.text).toBe('标题🙂');
  playback.setTarget('标题🙂后文续写', true);
  expect(playback.text).toBe('标题🙂');
  let settled = false;
  const done = playback.settled().then(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  playback.advance(100);
  await done;
  expect(playback.text).toBe('标题🙂后文续写');
});
it('renders planned frameworks immediately, retains the heading during expansion and handles corrected drafts', () => {
  const playback = new DraftPlayback();
  playback.setTarget('## 一\n\n框架', false);
  expect(playback.complete).toBe(true);
  playback.setTarget('## 一\n\n正文展开', true);
  expect(playback.text).toBe('## 一\n\n');
  playback.advance(50);
  expect(playback.text).toBe('## 一\n\n正文展');
  playback.setTarget('## 一\n\n修订', true);
  expect(playback.text).toBe('## 一\n\n');
});
it('releases a pending commit when the view unmounts', async () => {
  const playback = new DraftPlayback();
  playback.setTarget('pending', true);
  const done = playback.settled();
  playback.dispose();
  await done;
});
