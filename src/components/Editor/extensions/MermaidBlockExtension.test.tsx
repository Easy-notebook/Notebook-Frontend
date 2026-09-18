import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NodeViewProps } from '@tiptap/react';

vi.mock('@tiptap/react', () => ({
  NodeViewWrapper: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ReactNodeViewRenderer: vi.fn(),
}));
vi.mock('../MermaidPreview', () => ({ MermaidPreview: () => <div>Diagram preview</div> }));

import { MermaidBlockView } from './MermaidBlockExtension';

describe('Mermaid block controls', () => {
  it('allows viewing source without changing a read-only document', () => {
    const updateAttributes = vi.fn();
    render(
      <MermaidBlockView
        {...({
          node: { attrs: { code: 'graph TD; A-->B' } },
          editor: { isEditable: false },
          updateAttributes,
        } as unknown as NodeViewProps)}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Source' }));
    const input = screen.getByRole('textbox', { name: 'Mermaid source' });
    expect((input as HTMLTextAreaElement).readOnly).toBe(true);
    fireEvent.change(input, { target: { value: 'changed' } });
    expect(updateAttributes).not.toHaveBeenCalled();
  });
  it('switches between preview and source, edits and copies the source', async () => {
    const updateAttributes = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const props = {
      node: { attrs: { code: 'graph TD; A-->B' } },
      updateAttributes,
      editor: { isEditable: true },
    } as unknown as NodeViewProps;
    render(<MermaidBlockView {...props} />);

    expect(screen.getByText('Diagram preview')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Source' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Mermaid source' }), {
      target: { value: 'graph TD; B-->C' },
    });
    expect(updateAttributes).toHaveBeenCalledWith({ code: 'graph TD; B-->C' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy Mermaid source' }));
    });
    expect(writeText).toHaveBeenCalledWith('graph TD; A-->B');
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByText('Diagram preview')).not.toBeNull();
  });
});
