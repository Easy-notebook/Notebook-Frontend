import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { SpreadsheetEditSession } from './SpreadsheetEditSession';
import { useSpreadsheetDraftState } from './useSpreadsheetDraftState';

it('invalidates a save at edit admission before React commits the next render', () => {
  const session = new SpreadsheetEditSession();
  session.receiveSource('file', 'original');
  const { result } = renderHook(() => useSpreadsheetDraftState('original', session));
  const save = session.beginSave('saved');
  let acknowledged = true;
  act(() => {
    result.current[1]('newer');
    acknowledged = session.completeSave(save, 'saved');
  });
  expect(acknowledged).toBe(false);
  expect(result.current[0]).toBe('newer');
});
