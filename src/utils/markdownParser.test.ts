import { describe, expect, it, vi } from 'vitest';
import { Lexer } from 'marked';
import { parseMarkdownCells, updateCellsPhaseId } from './markdownParser';

const markdown = (id: string, content: string) => ({ id, type: 'markdown' as const, content });
describe('notebook task structure', () => {
  it('clears obsolete phase ownership when the last heading is removed', () => {
    const cells = [{ ...markdown('body', 'Plain text'), phaseId: 'deleted-phase' }];
    updateCellsPhaseId(cells, parseMarkdownCells(cells));
    expect(cells[0].phaseId).toBeNull();
  });
  it('only writes changed phase assignments and clips out-of-document ranges', () => {
    const cells = [
      { ...markdown('title', '# Notebook'), phaseId: 'title' },
      { ...markdown('body', 'Body'), phaseId: 'old' },
    ];
    const tasks = parseMarkdownCells(cells);
    tasks[0].phases[0].steps[0].startIndex = -1000000;
    tasks[0].phases[0].steps[0].endIndex = 1000000;
    const setter = vi.fn();
    Object.defineProperty(cells[0], 'phaseId', { get: () => 'title', set: setter });
    updateCellsPhaseId(cells, tasks);
    expect(setter).not.toHaveBeenCalled();
    expect(cells[1].phaseId).toBe('title');
  });
  it('keeps rich table source opaque across blank lines and nested tables', () => {
    const table =
      '<table><tr><td><pre><code>example\n\n# Not a task\n## Not a phase\n</code></pre><table><tr><td>nested</td></tr></table></td></tr></table>';
    const tasks = parseMarkdownCells([
      markdown('title', '# Notebook'),
      markdown('body', table + '\n\n## Outside'),
    ]);
    expect(tasks.map((task) => task.title)).toEqual(['Notebook']);
    expect(tasks[0].phases.map((phase) => phase.title)).toEqual(['Notebook', 'Outside']);
  });
  it('does not create hierarchy from an unfinished table source block', () => {
    const tasks = parseMarkdownCells([
      markdown('title', '# Notebook'),
      markdown('body', '<table>\n\n# Literal unfinished source'),
    ]);
    expect(tasks.map((task) => task.title)).toEqual(['Notebook']);
  });
  it('does not parse inline formatting when deriving block hierarchy', () => {
    const inline = vi.spyOn(Lexer.prototype, 'inlineTokens');
    try {
      const tasks = parseMarkdownCells([
        markdown('title', '# Notebook\r\n\r\n**body** [link](url)'),
      ]);
      expect(tasks[0].title).toBe('Notebook');
      expect(inline).not.toHaveBeenCalled();
    } finally {
      inline.mockRestore();
    }
  });
  it('does not interpret headings inside code examples or quotes as notebook structure', () => {
    const cells = [
      markdown('title', '# Notebook'),
      markdown(
        'body',
        '```markdown\n# Example\n## Not a phase\n```\n\n> ## Quoted heading\n\n## Real phase'
      ),
    ];
    const tasks = parseMarkdownCells(cells);
    expect(tasks.map((task) => task.title)).toEqual(['Notebook']);
    expect(tasks[0].phases.map((phase) => phase.title)).toEqual(['Notebook', 'Real phase']);
  });
  it('stores one reference per cell in each step regardless of paragraph or line count', () => {
    const body = markdown('body', 'line\n'.repeat(1000) + '\nsecond paragraph\n\n- list item');
    const tasks = parseMarkdownCells([markdown('title', '# Notebook'), body]);
    const content = tasks[0].phases[0].steps[0].content!;
    expect(content).toEqual([body]);
  });
  it('recognizes setext headings consistently with the Markdown editor', () => {
    const tasks = parseMarkdownCells([
      markdown('title', 'Notebook\n==='),
      markdown('phase', 'Phase\n---'),
    ]);
    expect(tasks[0].title).toBe('Notebook');
    expect(tasks[0].phases[1].title).toBe('Phase');
  });
});
