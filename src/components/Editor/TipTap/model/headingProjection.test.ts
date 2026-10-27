import { Schema } from '@tiptap/pm/model';
import { expect, it, vi } from 'vitest';
import * as markdown from '../../utils/inlineMarkdown';
import * as identity from '@Utils/markdown/headingIdentity';
import { projectHeadingIdentities } from './headingProjection';

it('retains heading discovery and normalized keys after identity-only rewriting', () => {
  const schema = new Schema({
    nodes: {
      doc: { content: 'block*' },
      markdownCell: { group: 'block', content: 'block*', attrs: { phaseId: { default: null } } },
      heading: {
        group: 'block',
        content: 'text*',
        attrs: { level: { default: 3 }, id: { default: null } },
      },
      paragraph: { group: 'block', content: 'text*' },
      text: {},
    },
  });
  const paragraph = schema.nodes.paragraph.create(null, schema.text('Untouched'));
  const block = schema.nodes.markdownCell.create({ phaseId: 'phase' }, [
    schema.nodes.heading.create({ level: 3, id: 'phase--sample' }, schema.text('Sample')),
    paragraph,
  ]);
  const cell = {
    id: 'cell',
    type: 'markdown' as const,
    phaseId: 'phase',
    content: '### Sample\n\nUntouched',
  };
  const parse = vi.spyOn(markdown, 'createMarkdownParser');
  const normalize = vi.spyOn(identity, 'headingSlug');
  try {
    expect(projectHeadingIdentities(block, cell, new Map())).toBe(block);
    expect(parse).toHaveBeenCalledTimes(1);
    expect(normalize).toHaveBeenCalledTimes(1);
    parse.mockClear();
    normalize.mockClear();
    const counters = () => new Map([['phase', new Map([['sample', 1]])]]);
    const adjusted = projectHeadingIdentities(block, cell, counters());
    expect(adjusted.child(0).attrs.id).toBe('phase--sample-2');
    expect(adjusted.child(1)).toBe(paragraph);
    expect(projectHeadingIdentities(adjusted, cell, counters())).toBe(adjusted);
    const moved = projectHeadingIdentities(adjusted, { ...cell, phaseId: 'other' }, new Map());
    expect(moved.child(0).attrs.id).toBe('other--sample');
    expect(moved.child(1)).toBe(paragraph);
    const detached = projectHeadingIdentities(moved, { ...cell, phaseId: undefined }, new Map());
    expect(detached.child(0).attrs.id).toBe('cell--sample');
    expect(parse).not.toHaveBeenCalled();
    expect(normalize).not.toHaveBeenCalled();
  } finally {
    parse.mockRestore();
    normalize.mockRestore();
  }
});
