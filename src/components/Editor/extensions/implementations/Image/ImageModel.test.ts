import { Editor, Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, expect, it, vi } from 'vitest';
import { ImageModel } from './ImageModel';

const TestImage = Node.create({
  name: 'markdownImage',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes: () => ({
    cellId: { default: null },
    fsmState: { default: 'editing' },
    src: { default: '' },
    alt: { default: '' },
  }),
  parseHTML: () => [{ tag: 'img' }],
  renderHTML: () => ['img'],
});
let editor: Editor | undefined;
afterEach(() => {
  editor?.destroy();
  editor = undefined;
});
function setup() {
  editor = new Editor({
    extensions: [StarterKit, TestImage],
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'before ' },
            { type: 'markdownImage', attrs: { cellId: 'owner' } },
            { type: 'text', text: ' after' },
          ],
        },
      ],
    },
  });
  const pos = 8;
  const node = editor.state.doc.nodeAt(pos)!;
  const onSave = vi.fn();
  const updateAttributes = vi.fn();
  const getPos = vi.fn<() => number | undefined>(() => pos);
  const fsm = ImageModel.createFSM(
    { node, editor, updateAttributes, deleteNode: vi.fn(), getPos, onSave },
    vi.fn()
  );
  return { fsm, node, pos, onSave, updateAttributes, getPos };
}

it.each(['ordinary text', ''])(
  'replaces the inline image with %j while preserving its paragraph and enters a terminal state',
  (markdown) => {
    const f = setup();
    expect(() => f.fsm.send('SAVE', { markdown })).not.toThrow();
    expect(editor!.state.doc.childCount).toBe(1);
    expect(editor!.state.doc.textContent).toBe(`before ${markdown} after`);
    expect(f.fsm.getCurrentState()).toBe('destroyed');
    expect(f.onSave).toHaveBeenCalledExactlyOnceWith(markdown);
    f.fsm.send('SAVE', { markdown: 'late' });
    expect(f.onSave).toHaveBeenCalledOnce();
  }
);

it('updates valid image attributes and publishes content after validation', () => {
  const f = setup();
  f.fsm.send('SAVE', { markdown: '![alt](https://example.com/image.png)' });
  expect(f.updateAttributes).toHaveBeenCalledWith({
    markdown: '![alt](https://example.com/image.png)',
    alt: 'alt',
    src: 'https://example.com/image.png',
  });
  expect(f.fsm.getCurrentState()).toBe('focused');
  expect(f.onSave).toHaveBeenCalledOnce();
});

it.each(['plain text', '![alt](image.png)'])(
  'rejects a stale editor owner before publishing %s',
  (markdown) => {
    const f = setup();
    editor!.commands.command(({ tr }) => {
      tr.setNodeMarkup(f.pos, undefined, { ...f.node.attrs, cellId: 'replacement' });
      return true;
    });
    const before = editor!.getJSON();
    f.fsm.send('SAVE', { markdown });
    expect(editor!.getJSON()).toEqual(before);
    expect(f.onSave).not.toHaveBeenCalled();
    expect(f.updateAttributes).not.toHaveBeenCalled();
  }
);

it('does not publish malformed saves or saves after node removal', () => {
  const f = setup();
  f.fsm.send('SAVE', { markdown: 42 });
  f.getPos.mockReturnValue(undefined);
  f.fsm.send('SAVE', { markdown: 'text' });
  expect(f.onSave).not.toHaveBeenCalled();
  expect(f.fsm.getCurrentState()).toBe('editing');
});
