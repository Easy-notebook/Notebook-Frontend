import type { CellObject } from 'xlsx-js-style';
import { expect, it } from 'vitest';
import { restoreWorkbookCellMetadata } from './XlsxCellMetadataReader';

function fixture(styleIndex = '1') {
  const file = (xml: string) => ({ content: new TextEncoder().encode(xml) });
  const cell: CellObject = { t: 's', v: 'value' };
  return {
    SheetNames: ['Main & More'],
    Sheets: { 'Main & More': { C3: cell } },
    files: {
      '_rels/.rels': file(
        '<Relationships><Relationship Type="type/officeDocument" Target="/xl/workbook.xml" /></Relationships>'
      ),
      'xl/workbook.xml': file(
        '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Main &amp; More" r:id="customId" /></sheets></workbook>'
      ),
      'xl/_rels/workbook.xml.rels': file(
        '<Relationships><Relationship Id="customId" Type="type/worksheet" Target="../custom/data.xml" /></Relationships>'
      ),
      'custom/data.xml': file(
        `<worksheet><sheetData><row><c r="C3" s="${styleIndex}" /></row></sheetData></worksheet>`
      ),
    },
    Styles: {
      Fonts: [{}, { bold: 1, italic: 0, underline: 1 }],
      Fills: [{}],
      Borders: [{}],
      CellXf: [{}, { fontId: 1, alignment: { horizontal: 'center' as const } }],
    },
  };
}

it('resolves actual worksheet relationships and normalizes parsed flags into independent cell styles', () => {
  const workbook = fixture();
  restoreWorkbookCellMetadata(workbook);
  expect(workbook.Sheets['Main & More'].C3.s).toMatchObject({
    font: { bold: true, italic: false, underline: true },
    alignment: { horizontal: 'center' },
  });
  workbook.Sheets['Main & More'].C3.s.font.bold = false;
  expect(workbook.Styles.Fonts[1].bold).toBe(1);
  expect(workbook).not.toHaveProperty('files');
});

it('rejects an invalid explicit cell style instead of silently replacing its formatting', () => {
  const workbook = fixture('999');
  expect(() => restoreWorkbookCellMetadata(workbook)).toThrow('Invalid cell style index');
  expect(workbook).not.toHaveProperty('files');
});

it('rejects external worksheet relationships without resolving a remote part', () => {
  const workbook = fixture();
  workbook.files['xl/_rels/workbook.xml.rels'].content = new TextEncoder().encode(
    '<Relationships><Relationship Id="customId" Type="type/worksheet" Target="https://example.test/sheet.xml" TargetMode="External" /></Relationships>'
  );
  expect(() => restoreWorkbookCellMetadata(workbook)).toThrow('Invalid worksheet relationship');
});
