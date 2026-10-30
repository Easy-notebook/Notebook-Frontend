import { useLayoutEffect, useState } from 'react';
import { DraftPlayback } from '@Services/agent-writing/DraftPlayback';
import { agentWriting } from '@Services/agent-writing/AgentWriting';

export function useDraftPlayback(id: string, source: string, animate: boolean) {
  const [playback] = useState(() => new DraftPlayback());
  const [text, setText] = useState('');
  useLayoutEffect(() => {
    const detach = agentWriting.present(id, () => playback.settled());
    return () => {
      detach();
      playback.dispose();
    };
  }, [id, playback]);
  useLayoutEffect(() => {
    playback.setTarget(source, animate);
    setText(playback.text);
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      setText(playback.advance(now - previous));
      previous = now;
      if (!playback.complete) frame = requestAnimationFrame(tick);
    };
    if (!playback.complete) frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [source, animate, playback]);
  return { text, revealing: text !== source };
}
