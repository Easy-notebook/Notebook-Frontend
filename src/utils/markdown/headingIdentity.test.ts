import { expect, it } from 'vitest';
import { indexHeadingTargets, nextHeadingIdentity } from './headingIdentity';
import { renderNotebookMarkdown } from '../../components/Editor/utils/notebookMarkdownParser';

it('matches rendered heading IDs across normalized collisions and non-Latin titles', () => {
  const headings = ['Repeat', 'repeat!', '中文', '另一个标题', 'Repeat'].map((title, index) => ({
    id: String(index),
    title,
  }));
  const targets = indexHeadingTargets('phase', headings);
  const container = document.createElement('div');
  container.innerHTML = renderNotebookMarkdown(
    '## Repeat\n\n' + headings.map((heading) => `### ${heading.title}`).join('\n\n'),
    { id: 'phase' },
    new Map()
  );
  expect(Array.from(container.querySelectorAll('h3'), (node) => node.id)).toEqual([
    ...targets.values(),
  ]);
  expect([...targets.values()]).toEqual([
    'phase--repeat',
    'phase--repeat-2',
    'phase--',
    'phase---2',
    'phase--repeat-3',
  ]);
});

it('shares counters across projected cells in a phase without affecting other phases', () => {
  const counters = new Map();
  const first = renderNotebookMarkdown('### Title', { id: 'one', phaseId: 'phase' }, counters);
  const second = renderNotebookMarkdown('### TITLE!', { id: 'two', phaseId: 'phase' }, counters);
  const other = renderNotebookMarkdown('### TITLE!', { id: 'three', phaseId: 'other' }, counters);
  expect(first).toContain('id="phase--title"');
  expect(second).toContain('id="phase--title-2"');
  expect(other).toContain('id="other--title"');
});

it('preserves existing URL normalization including truncation', () => {
  expect(nextHeadingIdentity('<b>Hello World</b>').key).toBe('hello-world');
  expect(nextHeadingIdentity('a'.repeat(100)).key).toHaveLength(80);
  const counters = new Map<string, number>();
  expect(nextHeadingIdentity('a'.repeat(100), counters).occurrence).toBe(1);
  expect(nextHeadingIdentity('a'.repeat(90), counters).occurrence).toBe(2);
});
