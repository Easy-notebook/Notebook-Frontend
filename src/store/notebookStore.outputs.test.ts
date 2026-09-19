import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import useStore from './notebookStore';
let original: ReturnType<typeof useStore.getState>;
beforeEach(() => {
  original = useStore.getState();
  useStore.getState().setCells([
    { id: 'title', type: 'markdown', content: '# Notebook' },
    { id: 'code', type: 'code', content: 'print(1)' },
  ]);
});
afterEach(() => useStore.setState(original, true));

it('serializes structured content once without mutating the input', () => {
  const toJSON = vi.fn(() => ({ value: 42 }));
  const payload = { toJSON };
  const input = [{ type: 'json', content: payload, timestamp: 'original' }];
  useStore.getState().updateCellOutputs('code', input);
  expect(toJSON).toHaveBeenCalledOnce();
  expect(input[0].content).toBe(payload);
  expect(useStore.getState().cells[1].outputs).toEqual([
    { type: 'json', content: '{"value":42}', timestamp: 'original' },
  ]);
});
it('preserves error and empty-result display markers', () => {
  useStore.getState().updateCellOutputs('code', [{ type: 'error', content: 'failure' }]);
  expect(useStore.getState().cells[1].outputs).toEqual([
    { type: 'text', content: '[error-message-for-debug]', timestamp: '' },
    { type: 'error', content: 'failure' },
  ]);
  useStore.getState().updateCellOutputs('code', []);
  expect(useStore.getState().cells[1].outputs).toEqual([
    { type: 'text', content: '[without-output]', timestamp: '' },
  ]);
});
it('keeps circular structured results displayable', () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  useStore.getState().updateCellOutputs('code', [{ type: 'json', content: circular }]);
  expect(useStore.getState().cells[1].outputs?.[0].content).toBe('[object Object]');
  expect(circular.self).toBe(circular);
});
