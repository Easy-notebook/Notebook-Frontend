import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ClaudeCodeTranscript } from '@Utils/importFile/ClaudeCodeTranscript';
import { TranscriptCellDocument } from '@Utils/importFile/TranscriptCellDocument';
import { ReadonlyMarkdown } from '../../ReadonlyMarkdown';
import { TranscriptCell } from './TranscriptCell';
import { NotebookOutlineModel } from '@Notebook/sections/LeftSidebar/Main/Workspace/OutlineView/NotebookOutlineModel';
import { resolveOutlineTarget } from '@Notebook/sections/LeftSidebar/Main/Workspace/OutlineView/useNotebookOutlineNavigation';
import { previewCellSource } from '../../Lexical/interaction/SourceTransitions';

it('renders literal tool text with collapsible output and never interprets source HTML', () => {
  const { cells } = new ClaudeCodeTranscript().parse(
    '❯ Check\n⏺ Bash(cat file)\n  ⎿  <script>bad()</script>\n     … +20 lines (ctrl+o to expand)',
    'test.txt'
  );
  const document = TranscriptCellDocument.read(cells[2])!;
  const { container } = render(<TranscriptCell document={document} />);
  const details = container.querySelector('details')!;
  expect(details.open).toBe(false);
  fireEvent.click(screen.getByText('Bash'));
  expect(details.open).toBe(true);
  expect(container.querySelector('script')).toBeNull();
  expect(container.textContent).toContain('<script>bad()</script>');
});

it('indexes prompts for navigation and keeps source previews non-executable', () => {
  const { cells } = new ClaudeCodeTranscript().parse(
    '❯ Check results\n⏺ Bash(ls)\n  ⎿  # not a heading',
    'test.txt'
  );
  const headings = NotebookOutlineModel.project(cells);
  expect(headings.map((item) => item.title)).toEqual(['test', 'Check results']);
  const root = document.createElement('div');
  root.innerHTML = `<div data-cell-id="${cells[1].id}"><h2>Check results</h2></div>`;
  expect(resolveOutlineTarget(root, headings[1])).toBe(root.querySelector('h2'));
  expect(
    previewCellSource({ ...cells[2], metadata: { ...cells[2].metadata, editorMode: 'source' } })
  ).toMatchObject({ type: 'code', content: cells[2].content });
});

it('renders prose as paragraphs, structured tables as tables and code in its own region', () => {
  const { cells } = new ClaudeCodeTranscript().parse(
    '❯ Explain\n⏺ **正文**\n\n  ```python\n  print(1)\n  ```\n\n  ┌───┬───┐\n  │ A │ B │\n  ├───┼───┤\n  │ 1 │ 2 │\n  └───┴───┘',
    'sample.txt'
  );
  const { container } = render(
    <>
      {cells.slice(2).map((cell) =>
        TranscriptCellDocument.read(cell)!.richMarkdown ? (
          <div className="transcript-prose" key={cell.id}>
            <ReadonlyMarkdown source={cell.content} />
          </div>
        ) : (
          <TranscriptCell key={cell.id} document={TranscriptCellDocument.read(cell)!} />
        )
      )}
    </>
  );
  expect(container.querySelector('.transcript-prose strong')?.textContent).toBe('正文');
  expect(
    container.querySelector('[data-transcript-cell-type="code"] .transcript-source')?.textContent
  ).toBe('print(1)');
  expect(container.querySelectorAll('table th')).toHaveLength(2);
  expect(container.querySelectorAll('table td')).toHaveLength(2);
});
