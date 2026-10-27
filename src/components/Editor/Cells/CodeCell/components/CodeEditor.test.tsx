import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CodeEditorProps } from '../utils/types';
import { EditorReadOnlyContext } from '../../../EditorAccessContext';

const themeState = vi.hoisted(() => ({ resolvedTheme: 'light' }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => themeState }));
vi.mock('../../../utils/previewVisibility', () => ({
  observePreview: (_element: Element, listener: (visible: boolean) => void) => {
    listener(true);
    return () => {};
  },
}));
vi.mock('@uiw/react-codemirror', () => ({
  default: ({ theme, readOnly, onChange, onKeyDown }: any) => (
    <div
      data-testid="code-mirror-theme"
      data-theme={typeof theme === 'string' ? theme : 'dark'}
      data-readonly={String(readOnly)}
      data-change={String(!!onChange)}
      data-keydown={String(!!onKeyDown)}
    />
  ),
}));

import { CodeEditor } from './CodeEditor';

describe('CodeEditor theme', () => {
  it.each(['isExecuting', 'dslcMode'] as const)(
    'disconnects mutations while %s is active',
    (mode) => {
      const props = {
        cell: { id: 'code', type: 'code', content: '', language: 'python' },
        isExecuting: false,
        dslcMode: false,
        onChange: vi.fn(),
        onKeyDown: vi.fn(),
        codeBlockWrapperRef: { current: null },
        onContentHeightChange: vi.fn(),
      } as unknown as CodeEditorProps;
      const view = render(<CodeEditor {...props} />);
      const node = view.getByTestId('code-mirror-theme');
      view.rerender(<CodeEditor {...props} {...{ [mode]: true }} />);
      expect(node.getAttribute('data-readonly')).toBe('true');
      expect(node.getAttribute('data-change')).toBe('false');
      expect(node.getAttribute('data-keydown')).toBe('false');
      view.rerender(<CodeEditor {...props} />);
      expect(node.getAttribute('data-readonly')).toBe('false');
      expect(node.getAttribute('data-change')).toBe('true');
      expect(node.getAttribute('data-keydown')).toBe('true');
      view.unmount();
    }
  );
  it('reacts to notebook read-only transitions and removes mutation callbacks', () => {
    const props = {
      cell: { id: 'code', type: 'code', content: 'print(1)', language: 'python' },
      isExecuting: false,
      dslcMode: false,
      onChange: vi.fn(),
      onKeyDown: vi.fn(),
      codeBlockWrapperRef: { current: null },
      onContentHeightChange: vi.fn(),
    } as unknown as CodeEditorProps;
    const view = render(
      <EditorReadOnlyContext.Provider value={false}>
        <CodeEditor {...props} />
      </EditorReadOnlyContext.Provider>
    );
    const node = view.getByTestId('code-mirror-theme');
    expect(node.getAttribute('data-readonly')).toBe('false');
    view.rerender(
      <EditorReadOnlyContext.Provider value={true}>
        <CodeEditor {...props} />
      </EditorReadOnlyContext.Provider>
    );
    expect(node.getAttribute('data-readonly')).toBe('true');
    expect(node.getAttribute('data-change')).toBe('false');
    expect(node.getAttribute('data-keydown')).toBe('false');
    view.rerender(
      <EditorReadOnlyContext.Provider value={false}>
        <CodeEditor {...props} />
      </EditorReadOnlyContext.Provider>
    );
    expect(node.getAttribute('data-change')).toBe('true');
    view.unmount();
  });
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
      codeBlockWrapperRef: { current: null },
      onContentHeightChange: vi.fn(),
    } as unknown as CodeEditorProps;

    themeState.resolvedTheme = 'light';
    const view = render(<CodeEditor {...props} />);
    expect(screen.getByTestId('code-mirror-theme').getAttribute('data-theme')).toBe('light');
    themeState.resolvedTheme = 'dark';
    view.rerender(<CodeEditor {...props} />);
    expect(screen.getByTestId('code-mirror-theme').getAttribute('data-theme')).toBe('dark');
  });
});
