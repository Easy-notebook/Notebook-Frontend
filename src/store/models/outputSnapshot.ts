import { shallow } from 'zustand/shallow';
import type { OutputItem } from './cell';

/** Reuse unchanged canonical rows after transport serialization, without deep-copying payloads. */
export function reconcileOutputSnapshot(
  previous: OutputItem[] | undefined,
  next: OutputItem[]
): OutputItem[] {
  if (!previous) return next;
  let unchanged = previous.length === next.length;
  const result = next.map((output, index) => {
    const prior = previous[index];
    if (prior && shallow(prior, output)) return prior;
    unchanged = false;
    return output;
  });
  return unchanged ? previous : result;
}
