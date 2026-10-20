import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NodeViewProps } from '@tiptap/react';

vi.mock('@tiptap/react', () => ({
  NodeViewWrapper: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ReactNodeViewRenderer: vi.fn(),
}));
vi.mock('../MermaidPreview', () => ({ MermaidPreview: () => <div>Diagram preview</div> }));

import { MermaidBlockView as SourceMermaidBlockView } from './MermaidBlockExtension';

function MermaidBlockView(props: NodeViewProps) {
  return (
    <SourceMermaidBlockView
      {...props}
      getPos={props.getPos || (() => 0)}
      editor={
        {
          ...props.editor,
          state: props.editor.state ?? { doc: { nodeAt: () => props.node } },
        } as unknown as NodeViewProps['editor']
      }
    />
  );
}

describe('Mermaid block controls', () => {
  it('reattaches native history once per source view and releases the old input', () => {
    const commands = { undo: vi.fn(), redo: vi.fn() };
    render(
      <MermaidBlockView
        {...({
          node: { attrs: { code: 'graph TD; A-->B' } },
          editor: { isEditable: true, commands },
          updateAttributes: vi.fn(),
        } as unknown as NodeViewProps)}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Source' }));
    const previous = screen.getByRole('textbox');
    const history = (element: HTMLElement, inputType: string) => {
      const event = new InputEvent('beforeinput', { inputType, cancelable: true, bubbles: true });
      fireEvent(element, event);
      return event.defaultPrevented;
    };
    expect(history(previous, 'historyUndo')).toBe(true);
    expect(commands.undo).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(history(previous, 'historyUndo')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Source' }));
    expect(history(screen.getByRole('textbox'), 'historyRedo')).toBe(true);
    expect(commands.redo).toHaveBeenCalledOnce();
    expect(commands.undo).toHaveBeenCalledOnce();
  });
  it('discards copy feedback when source changes before clipboard completion', async () => {
    let resolve!: () => void;
    const writeText = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        })
    );
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const props = {
      node: { attrs: { code: 'old' } },
      editor: { isEditable: true },
      updateAttributes: vi.fn(),
    } as unknown as NodeViewProps;
    const view = render(<MermaidBlockView {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy Mermaid source' }));
    view.rerender(
      <MermaidBlockView
        {...props}
        node={{ attrs: { code: 'new' } } as unknown as NodeViewProps['node']}
      />
    );
    await act(async () => resolve());
    expect(screen.queryByText('Source copied')).toBeNull();
    expect(writeText).toHaveBeenCalledExactlyOnceWith('old');
  });
  it('does not replace a newer copy success with an older failure', async () => {
    let reject!: (error: Error) => void;
    const writeText = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_, fail) => {
            reject = fail;
          })
      )
      .mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(
      <MermaidBlockView
        {...({
          node: { attrs: { code: 'source' } },
          editor: { isEditable: true },
          updateAttributes: vi.fn(),
        } as unknown as NodeViewProps)}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy Mermaid source' }));
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Copy Mermaid source' }))
    );
    await act(async () => reject(new Error('old failure')));
    expect(screen.getByText('Source copied')).toBeDefined();
    expect(screen.queryByText('Could not copy source')).toBeNull();
  });
  it.each(['', '短', 'graph TD'])(
    'restores a valid selection after preview source shrinks to %j',
    (code) => {
      const updateAttributes = vi.fn();
      const props = {
        node: { attrs: { code: 'flowchart LR; A-->B' } },
        editor: { isEditable: true },
        updateAttributes,
      } as unknown as NodeViewProps;
      const view = render(<MermaidBlockView {...props} />);
      fireEvent.click(screen.getByRole('button', { name: 'Source' }));
      const input = screen.getByRole('textbox') as HTMLTextAreaElement;
      input.setSelectionRange(10, 16, 'backward');
      fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
      view.rerender(
        <MermaidBlockView
          {...props}
          node={{ attrs: { code } } as unknown as NodeViewProps['node']}
        />
      );
      expect(screen.queryByRole('textbox')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Source' }));
      const restored = screen.getByRole('textbox') as HTMLTextAreaElement;
      expect(restored.value).toBe(code);
      expect(restored.selectionStart).toBe(code.length);
      expect(restored.selectionEnd).toBe(code.length);
      expect(document.activeElement).toBe(restored);
      expect(updateAttributes).not.toHaveBeenCalled();
    }
  );
  it('pins undo to the composition lifecycle when native key flags are absent', () => {
    const commands = { undo: vi.fn() };
    render(
      <MermaidBlockView
        {...({
          node: { attrs: { code: 'graph TD; A-->B' } },
          editor: { isEditable: true, commands },
          updateAttributes: vi.fn(),
        } as unknown as NodeViewProps)}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Source' }));
    const input = screen.getByRole('textbox');
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
    expect(commands.undo).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
    expect(commands.undo).toHaveBeenCalledOnce();
  });
  it('rejects a source edit when its rendered node has been replaced', () => {
    const node = { attrs: { code: 'graph TD; A-->B' } };
    const nodeAt = vi.fn(() => node);
    const updateAttributes = vi.fn();
    const commands = { undo: vi.fn() };
    const props = {
      node,
      updateAttributes,
      editor: { isEditable: true, state: { doc: { nodeAt } }, commands },
    } as unknown as NodeViewProps;
    const view = render(<MermaidBlockView {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Source' }));
    const input = screen.getByRole('textbox');
    const replacement = { attrs: { code: 'graph TD; NEW-->VALUE' } };
    nodeAt.mockReturnValue(replacement);
    fireEvent.change(input, { target: { value: 'stale edit' } });
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
    expect(updateAttributes).not.toHaveBeenCalled();
    expect(commands.undo).not.toHaveBeenCalled();
    view.rerender(
      <MermaidBlockView {...props} node={replacement as unknown as NodeViewProps['node']} />
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'graph TD; NEW-->EDITED' } });
    expect(updateAttributes).toHaveBeenCalledExactlyOnceWith({ code: 'graph TD; NEW-->EDITED' });
  });
  it('keeps source mounted during composition and permits preview afterwards', () => {
    const updateAttributes = vi.fn();
    render(
      <MermaidBlockView
        {...({
          node: { attrs: { code: 'graph TD; A-->B' } },
          editor: { isEditable: true },
          updateAttributes,
        } as unknown as NodeViewProps)}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Source' }));
    const input = screen.getByRole('textbox', { name: 'Mermaid source' });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'graph TD; A[中文]-->B' } });
    expect(updateAttributes).toHaveBeenCalledWith({ code: 'graph TD; A[中文]-->B' });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByRole('textbox', { name: 'Mermaid source' })).toBe(input);
    fireEvent.compositionEnd(input);
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.queryByRole('textbox')).toBeNull();
  });
  it('opens and focuses source for a newly selected empty diagram without writing content', () => {
    const updateAttributes = vi.fn();
    const props = {
      node: { attrs: { code: '' } },
      editor: { isEditable: true },
      selected: false,
      updateAttributes,
    } as unknown as NodeViewProps;
    const view = render(<MermaidBlockView {...props} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    view.rerender(<MermaidBlockView {...props} selected />);
    const input = screen.getByRole('textbox', { name: 'Mermaid source' });
    expect(document.activeElement).toBe(input);
    expect(updateAttributes).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('does not automatically focus source for a selected read-only empty diagram', () => {
    render(
      <MermaidBlockView
        {...({
          node: { attrs: { code: '' } },
          editor: { isEditable: false },
          selected: true,
          updateAttributes: vi.fn(),
        } as unknown as NodeViewProps)}
      />
    );
    expect(screen.queryByRole('textbox')).toBeNull();
  });
  it('restores source focus, selection direction and scroll without publishing content', () => {
    const updateAttributes = vi.fn();
    render(
      <MermaidBlockView
        {...({
          node: { attrs: { code: 'flowchart LR; A-->B' } },
          editor: { isEditable: true },
          updateAttributes,
        } as unknown as NodeViewProps)}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Source' }));
    const input = screen.getByRole('textbox', { name: 'Mermaid source' }) as HTMLTextAreaElement;
    expect(document.activeElement).toBe(input);
    input.setSelectionRange(3, 9, 'backward');
    input.scrollTop = 120;
    input.scrollLeft = 20;
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Source' }));
    const restored = screen.getByRole('textbox', { name: 'Mermaid source' }) as HTMLTextAreaElement;
    expect(document.activeElement).toBe(restored);
    expect([restored.selectionStart, restored.selectionEnd, restored.selectionDirection]).toEqual([
      3,
      9,
      'backward',
    ]);
    expect([restored.scrollTop, restored.scrollLeft]).toEqual([120, 20]);
    expect(updateAttributes).not.toHaveBeenCalled();
  });
  it('routes source undo and redo to document history but leaves composition untouched', () => {
    const commands = { undo: vi.fn(), redo: vi.fn() };
    render(
      <MermaidBlockView
        {...({
          node: { attrs: { code: 'flowchart LR; A-->B' } },
          editor: { isEditable: true, commands },
          updateAttributes: vi.fn(),
        } as unknown as NodeViewProps)}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Source' }));
    const input = screen.getByRole('textbox', { name: 'Mermaid source' });
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(input, { key: 'y', ctrlKey: true });
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true, isComposing: true });
    expect(commands.undo).toHaveBeenCalledOnce();
    expect(commands.redo).toHaveBeenCalledOnce();
  });
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
