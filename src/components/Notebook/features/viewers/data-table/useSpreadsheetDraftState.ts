import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { SpreadsheetEditSession } from './SpreadsheetEditSession';

/** Invalidate acknowledgements at edit admission, before React batches the next render. */
export function useSpreadsheetDraftState<T>(
  initial: T,
  session: SpreadsheetEditSession
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(initial);
  const update = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      session.changed();
      setValue(next);
    },
    [session]
  );
  return [value, update];
}
