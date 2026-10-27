import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { expect, it } from 'vitest';
import { ImageExtension } from '../../extensions/implementations/Image/ImageExtension';
import { FileAttachmentExtension } from '../../extensions/FileAttachmentExtension';
import { createUploadedAssetNode } from './UploadedAssetNode';

it.each([
  'photo.png',
  '报告 "quoted" & <tag>.PNG',
  'x" data-extra="injected.svg',
  'report "Q1" & <tag>.pdf',
])('inserts %s as literal attributes through the real editor schema', (name) => {
  const editor = new Editor({ extensions: [StarterKit, ImageExtension, FileAttachmentExtension] });
  try {
    const node = createUploadedAssetNode('notebook/a', name);
    expect(editor.commands.insertContent(node)).toBe(true);
    const matches: Record<string, unknown>[] = [];
    editor.state.doc.descendants((child) => {
      if (child.type.name === node.type) matches.push(child.attrs);
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject(node.attrs!);
    const html = document.createElement('div');
    html.innerHTML = editor.getHTML();
    expect(html.querySelector('[data-extra]')).toBeNull();
    expect(html.querySelector('tag')).toBeNull();
    if (node.type === 'markdownImage') {
      expect(matches[0].alt).toBe(name);
      expect(matches[0].src).toContain('/notebook%2Fa/');
      expect(matches[0].src).toContain(encodeURIComponent(name));
    } else {
      expect(matches[0].markdown).toContain(name);
    }
  } finally {
    editor.destroy();
  }
});
