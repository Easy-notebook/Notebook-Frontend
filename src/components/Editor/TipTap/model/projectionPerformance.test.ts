import { describe, expect, it, vi } from 'vitest';
import { Schema, Node } from '@tiptap/pm/model';
import { convertEditorStateToCells } from '../../utils/cellConverters';

const schema = new Schema({
  nodes: {
    doc: { content: 'markdownCell*' },
    markdownCell: { content: 'paragraph', attrs: { cellId: {} } },
    paragraph: { content: 'text*' },
    text: {},
  },
});
const block = (id: string, text: string) =>
  schema.nodes.markdownCell.create(
    { cellId: id },
    schema.nodes.paragraph.create(null, schema.text(text))
  );

describe('incremental cell projection', () => {
  it.each([100, 1000])('serializes only a changed block in a %i-cell document', (count) => {
    const blocks = Array.from({ length: count }, (_, index) => block(`${index}`, 'content'));
    const editor = { state: { doc: schema.nodes.doc.create(null, blocks) } };
    const before = convertEditorStateToCells(editor);
    const spy = vi.spyOn(Node.prototype, 'toJSON');
    try {
      expect(convertEditorStateToCells(editor)).toBe(before);
      expect(spy).not.toHaveBeenCalled();
      blocks[50] = block('50', 'changed');
      editor.state.doc = schema.nodes.doc.create(null, blocks);
      const after = convertEditorStateToCells(editor);
      // One cell + one paragraph + one text, independent of notebook length.
      expect(spy).toHaveBeenCalledTimes(3);
      expect(after[50].content).toBe('changed');
      expect(after.filter((cell, index) => cell === before[index])).toHaveLength(count - 1);
    } finally {
      spy.mockRestore();
    }
  });
});
