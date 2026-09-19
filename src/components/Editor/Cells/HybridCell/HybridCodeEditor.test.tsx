import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { EditorReadOnlyContext } from '../../EditorAccessContext';
const visibility = vi.hoisted(() => ({ report: (_visible: boolean) => {} }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));
vi.mock('../../utils/previewVisibility', () => ({
  observePreview: (_element: Element, report: (value: boolean) => void) => {
    visibility.report = report;
    return () => {};
  },
}));
vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value, readOnly, onChange }: any) => (
    <textarea
      aria-label="Mounted hybrid editor"
      value={value}
      readOnly={readOnly}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
    />
  ),
}));
import { HybridCodeEditor } from './HybridCodeEditor';
afterEach(cleanup);
it('defers offscreen instances until visible and uses the latest content on activation', () => {
  const props = { cellId: 'hybrid', language: 'python', current: false, onChange: vi.fn() };
  const view = render(<HybridCodeEditor {...props} content="before" />);
  expect(screen.queryByRole('textbox')).toBeNull();
  view.rerender(<HybridCodeEditor {...props} content="latest" />);
  act(() => visibility.report(true));
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('latest');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'edited' } });
  expect(props.onChange).toHaveBeenCalledWith('edited');
});
it('activates on keyboard focus and preserves read-only restrictions', () => {
  const onChange = vi.fn();
  render(
    <EditorReadOnlyContext.Provider value={true}>
      <HybridCodeEditor
        cellId="hybrid-readonly"
        content="print(1)"
        current={false}
        onChange={onChange}
      />
    </EditorReadOnlyContext.Provider>
  );
  fireEvent.focus(screen.getByLabelText('Code preview; focus to activate editor'));
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).readOnly).toBe(true);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'blocked' } });
  expect(onChange).not.toHaveBeenCalled();
});
