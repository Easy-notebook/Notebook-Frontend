import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Packer } from 'docx';
// Inspect the same ZIP container format used by docx's runtime dependency.
import JSZip from 'jszip';
import { exportToDocx } from './exportToDocx';

let archive: JSZip | undefined;
beforeEach(() => {
  archive = undefined;
  vi.spyOn(Packer, 'toBlob').mockImplementation(async (document) => {
    archive = await JSZip.loadAsync(await Packer.toBuffer(document));
    return new Blob(['test download']);
  });
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:document'), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  ['png', 'png'],
  ['jpeg', 'jpg'],
  ['jpg', 'jpg'],
  ['gif', 'gif'],
  ['bmp', 'bmp'],
  ['PNG', 'png'],
])(
  'packages declared %s output with the correct DOCX media extension %s',
  async (format, extension) => {
    await exportToDocx([
      {
        id: 'code',
        type: 'code',
        content: 'print(1)',
        outputs: [{ type: 'image', content: `data:image/${format};base64,AQID` }],
      },
    ]);
    const media = Object.values(archive!.files).filter(
      (file) => !file.dir && file.name.startsWith('word/media/')
    );
    expect(media).toHaveLength(1);
    expect(media[0].name).toMatch(new RegExp(`\\.${extension}$`));
    expect([...(await media[0].async('uint8array'))]).toEqual([1, 2, 3]);
    const relationships = await archive!.file('word/_rels/document.xml.rels')!.async('string');
    expect(relationships).toContain(media[0].name.replace('word/', ''));
    expect(relationships).not.toContain('.undefined');
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
  }
);
it('rejects unsupported output formats before downloading a partial document', async () => {
  await expect(
    exportToDocx([
      {
        id: 'code',
        type: 'code',
        content: 'pass',
        outputs: [{ type: 'image', content: 'data:image/webp;base64,AQID' }],
      },
    ])
  ).rejects.toThrow('Unsupported DOCX image format: webp');
  expect(Packer.toBlob).not.toHaveBeenCalled();
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
});

async function documentText() {
  const xml = await archive!.file('word/document.xml')!.async('string');
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  expect(document.getElementsByTagName('parsererror')).toHaveLength(0);
  return [...document.getElementsByTagName('w:t')].map((node) => node.textContent).join('');
}
it('retains hybrid prose, fenced code and outputs in the actual document', async () => {
  await exportToDocx([
    {
      id: 'hybrid',
      type: 'hybrid',
      content: 'Before\n\n```python\nprint(7)\n```\n\nAfter',
      outputs: [{ type: 'text', content: 'result 7' }],
    },
  ]);
  const text = await documentText();
  expect(text).toContain('Before');
  expect(text).toContain('print(7)');
  expect(text.indexOf('Before')).toBeLessThan(text.indexOf('print(7)'));
  expect(text.indexOf('print(7)')).toBeLessThan(text.indexOf('After'));
  expect(text.indexOf('After')).toBeLessThan(text.indexOf('result 7'));
  expect(text.match(/result 7/g)).toHaveLength(1);
  expect(text).not.toContain('```python');
});
it('retains output from an empty hybrid source and numeric zero', async () => {
  await exportToDocx([
    {
      id: 'hybrid',
      type: 'hybrid',
      content: '',
      outputs: [
        { type: 'text', content: 0 },
        { type: 'error', content: 'failure' },
      ],
    },
  ]);
  expect(await documentText()).toBe('0failure');
});
it('uses shared fence parsing for tilde fences and nested delimiters', async () => {
  await exportToDocx([
    {
      id: 'md',
      type: 'markdown',
      content: 'Intro\n\n~~~~text\n# literal heading\n```inside```\n~~~~\n\nTail',
    },
  ]);
  const text = await documentText();
  expect(text).toBe('Intro# literal heading```inside```Tail');
});

it.each([
  ['javascript', 'const message = `Hello ${user.name}!`;'],
  ['jsx', 'const view = <div title="hello">{user.name}</div>;'],
  ['python', 'message = f"Hello {user.name}!"'],
])('preserves nested %s syntax tokens in document text', async (language, content) => {
  await exportToDocx([{ id: 'code', type: 'code', language, content }]);
  expect(await documentText()).toBe(content);
});
