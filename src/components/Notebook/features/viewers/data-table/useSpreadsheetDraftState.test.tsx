import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { SpreadsheetSaveSession } from './SpreadsheetSaveSession';
import { useSpreadsheetDraftState } from './useSpreadsheetDraftState';

it('invalidates a save at edit admission before React commits the next render', () => {
  const session = new SpreadsheetSaveSession();
  session.receiveSource('file', 'original');
  const { result } = renderHook(() => useSpreadsheetDraftState('original', session));
  const save = session.begin('saved');
  let acknowledged = true;
  act(() => {
    result.current[1]('newer');
    acknowledged = session.complete(save, 'saved');
  });
  expect(acknowledged).toBe(false);
  expect(result.current[0]).toBe('newer');
});
