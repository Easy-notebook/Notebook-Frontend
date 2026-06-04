import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProseMirrorMarkdownCell } from '../ProseMirrorMarkdownCell';
import {
  cellsToDoc,
  docToCells,
  NotebookEditorCore,
  notebookSchema,
} from '@/components/Editor/core';
import type {
  EasyNotebookCell,
  EasyNotebookCellActions,
  EasyNotebookCellComponentProps,
  EasyNotebookDocument,
} from '../../../headless';

const makeCell = (overrides: Partial<EasyNotebookCell> = {}): EasyNotebookCell => ({
  id: 'cell-1',
  type: 'markdown',
  content: '# Hello\n\nWorld',
  ...overrides,
});

const makeActions = (
  overrides: Partial<EasyNotebookCellActions> = {}
): EasyNotebookCellActions => ({
  updateCell: vi.fn(),
  updateContent: vi.fn(),
  deleteCell: vi.fn(),
  insertCellAfter: vi.fn(),
  moveCell: vi.fn(),
  setOutputs: vi.fn(),
  executeCell: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const makeProps = (
  cell: EasyNotebookCell,
  actions: EasyNotebookCellActions,
  readOnly = false
): EasyNotebookCellComponentProps => {
  const notebook: EasyNotebookDocument = { id: 'nb', cells: [cell] };
  return { cell, index: 0, notebook, readOnly, actions };
};

afterEach(() => {
  cleanup();
});

describe('ProseMirrorMarkdownCell', () => {
  it('mounts without throwing and renders a ProseMirror editor', () => {
    const cell = makeCell();
    const actions = makeActions();
    const { container } = render(<ProseMirrorMarkdownCell {...makeProps(cell, actions)} />);

    const host = container.querySelector('.easy-notebook-pm-markdown');
    expect(host).not.toBeNull();
    // PM injects a contenteditable .ProseMirror node into the mount host.
    expect(container.querySelector('.ProseMirror')).not.toBeNull();
  });

  it('round-trips the markdown content through the cell<->doc bridge', () => {
    const markdown = '# Title\n\nSome **bold** text';
    // The component uses cellsToDoc/docToCells on a single-cell array; assert
    // that bridge is lossless for our content so the seeded doc matches input.
    const doc = cellsToDoc([{ id: 'cell-1', type: 'markdown', content: markdown }]);
    const back = docToCells(doc).find((c) => c.type === 'markdown');
    expect(back?.content?.trim()).toBe(markdown.trim());
  });

  it('seeds the editor from cell.content and serializes the same markdown back', () => {
    const markdown = 'Line one\n\nLine two';
    const core = new NotebookEditorCore({
      schema: notebookSchema,
      initialDoc: cellsToDoc([{ id: 'cell-1', type: 'markdown', content: markdown }]),
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    core.mount(host);

    const out = docToCells(core.state.doc).find((c) => c.type === 'markdown');
    expect(out?.content?.trim()).toBe(markdown.trim());

    core.destroy();
    host.remove();
  });

  it('does not echo external content syncs back to updateContent', () => {
    const cell = makeCell({ content: 'initial' });
    const actions = makeActions();
    const { rerender } = render(<ProseMirrorMarkdownCell {...makeProps(cell, actions)} />);

    // Simulate the store pushing a new value in (external origin).
    const updated = makeCell({ content: 'externally changed' });
    rerender(<ProseMirrorMarkdownCell {...makeProps(updated, actions)} />);

    // applyExternal flags the transaction; the change listener must skip it.
    expect(actions.updateContent).not.toHaveBeenCalled();
  });

  it('honors readOnly by disabling contentEditable', () => {
    const cell = makeCell();
    const actions = makeActions();
    const { container } = render(<ProseMirrorMarkdownCell {...makeProps(cell, actions, true)} />);

    const pm = container.querySelector('.ProseMirror');
    expect(pm).not.toBeNull();
    expect(pm?.getAttribute('contenteditable')).toBe('false');
  });
});
