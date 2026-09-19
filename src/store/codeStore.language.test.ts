import { describe, expect, it, vi } from 'vitest';

vi.mock('@Store/notebookStore', () => ({
  default: {
    getState: () => ({
      cells: [{ id: 'js-cell', type: 'code', content: 'console.log(1)', language: 'javascript' }],
    }),
  },
}));

import useCodeStore from './codeStore';

describe('code execution language guard', () => {
  it('rejects JavaScript before starting the Python kernel', async () => {
    const initializeKernel = vi.fn();
    useCodeStore.setState({ initializeKernel });
    const result = await useCodeStore.getState().executeCell('js-cell');
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('Python only') });
    expect(initializeKernel).not.toHaveBeenCalled();
  });
});
