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
