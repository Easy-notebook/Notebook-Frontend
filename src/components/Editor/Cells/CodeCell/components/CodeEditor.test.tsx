import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CodeEditorProps } from '../utils/types';

const themeState = vi.hoisted(() => ({ resolvedTheme: 'light' }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => themeState }));
vi.mock('@uiw/react-codemirror', () => ({
  default: ({ theme }: { theme: string | object }) => (
    <div data-testid="code-mirror-theme" data-theme={typeof theme === 'string' ? theme : 'dark'} />
  ),
}));

import { CodeEditor } from './CodeEditor';

describe('CodeEditor theme', () => {
  it('follows the resolved notebook theme', () => {
    const props = {
      cell: { id: 'code', type: 'code', content: 'print(1)', language: 'python' },
      content: 'print(1)',
      isExecuting: false,
      isCurrentCell: false,
      dslcMode: false,
      isInDetachedView: false,
      contentHeight: 0,
      isExpanded: true,
      isHovering: false,
      onHoverChange: vi.fn(),
    } as unknown as CodeEditorProps;

    themeState.resolvedTheme = 'light';
    const view = render(<CodeEditor {...props} />);
    expect(screen.getByTestId('code-mirror-theme').getAttribute('data-theme')).toBe('light');
    themeState.resolvedTheme = 'dark';
    view.rerender(<CodeEditor {...props} />);
    expect(screen.getByTestId('code-mirror-theme').getAttribute('data-theme')).toBe('dark');
  });
});
