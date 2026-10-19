import * as XLSX from 'xlsx-js-style';
import { expect, it } from 'vitest';
import { XlsxDocument } from './XlsxDocument';
import { writtenCellStyle } from './testing/writtenCellStyle';

function source() {
  const book = XLSX.utils.book_new();
  const sheet: XLSX.WorkSheet = {
    C3: { t: 's', v: 'original' },
    D3: { t: 'n', v: 42, z: '0.00' },
    C4: { t: 'n', v: 84, f: 'D3*2' },
    D4: { t: 'b', v: true },
    '!ref': 'C3:D4',
    '!cols': [{ wch: 24 }],
  };
  XLSX.utils.book_append_sheet(book, sheet, 'Main');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['keep', 7]]), 'Other');
  book.Props = { Title: 'Workbook title' };
  return XLSX.write(book, { type: 'base64', bookType: 'xlsx' }) as string;
}

it('writes an actual workbook while retaining offset, other sheets, properties and untouched cell types', () => {
  const document = XlsxDocument.fromBase64(source());
  const output = document.serialize(
    [
      { A: '中文, "edit"', B: '42.00' },
      { A: '84', B: 'TRUE' },
    ],
    [{ key: 'A' }, { key: 'B' }]
  );
  const saved = XLSX.read(output, { type: 'base64', cellNF: true });
  expect(saved.SheetNames).toEqual(['Main', 'Other']);
  expect(saved.Props?.Title).toBe('Workbook title');
  expect(saved.Sheets.Other.A1.v).toBe('keep');
  expect(saved.Sheets.Other.B1).toMatchObject({ t: 'n', v: 7 });
  expect(saved.Sheets.Main['!ref']).toBe('C3:D4');
  expect(saved.Sheets.Main.C3).toMatchObject({ t: 's', v: '中文, "edit"' });
  expect(saved.Sheets.Main.D3).toMatchObject({ t: 'n', v: 42, z: '0.00' });
  expect(saved.Sheets.Main.C4).toMatchObject({ f: 'D3*2', v: 84 });
  expect(saved.Sheets.Main.D4).toMatchObject({ t: 'b', v: true });
  expect(document.worksheet.C3.v).toBe('original');
});

it('removes the previous formula when its displayed cell is replaced and drops deleted rows', () => {
  const document = XlsxDocument.fromBase64(source());
  const saved = XLSX.read(
    document.serialize(
      [
        { A: 'changed', B: 5 },
        { A: 'manual', B: false },
      ],
      [{ key: 'A' }, { key: 'B' }]
    ),
    { type: 'base64' }
  );
  expect(saved.Sheets.Main.C4.f).toBeUndefined();
  expect(saved.Sheets.Main.C4.v).toBe('manual');
  expect(saved.Sheets.Main.D3).toMatchObject({ t: 'n', v: 5 });
  const shrunk = XLSX.read(document.serialize([{ A: 'remaining' }], [{ key: 'A' }]), {
    type: 'base64',
  });
  expect(shrunk.Sheets.Main['!ref']).toBe('C3');
  expect(shrunk.Sheets.Main.C4).toBeUndefined();
  expect(shrunk.Sheets.Main.D3).toBeUndefined();
});

it('retains the other sheet when the edited grid is emptied', () => {
  const saved = XLSX.read(XlsxDocument.fromBase64(source()).serialize([], []), { type: 'base64' });
  expect(saved.Sheets.Main.C3).toBeUndefined();
  expect(saved.Sheets.Other.A1.v).toBe('keep');
});

it('writes user formatting into the actual cell style references, including unchanged formula cells', async () => {
  const document = XlsxDocument.fromBase64(source());
  const saved = document.serialize(
    [
      { A: 'original', B: '42.00' },
      { A: '84', B: 'TRUE' },
    ],
    [{ key: 'A' }, { key: 'B' }],
    {
      '0:0': {
        bold: true,
        italic: true,
        underline: true,
        color: '#ab12cd',
        backgroundColor: '#12ab34',
        textAlign: 'center',
      },
      '1:0': { italic: true },
    }
  );
  const style = writtenCellStyle(saved, 'C3');
  expect(style.font.getElementsByTagName('b')).toHaveLength(1);
  expect(style.font.getElementsByTagName('i')).toHaveLength(1);
  expect(style.font.getElementsByTagName('u')).toHaveLength(1);
  expect(style.font.getElementsByTagName('color')[0].getAttribute('rgb')).toBe('AB12CD');
  expect(style.fill.getElementsByTagName('fgColor')[0].getAttribute('rgb')).toBe('FF12AB34');
  expect(style.alignment.getAttribute('horizontal')).toBe('center');
  expect(writtenCellStyle(saved, 'C4').font.getElementsByTagName('i')).toHaveLength(1);
  expect(XLSX.read(saved, { type: 'base64' }).Sheets.Main.C4.f).toBe('D3*2');
});

it('projects cells and merged regions through the same worksheet origin without exposing mutable source cells', () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    {
      C3: { t: 's', v: 'merged' },
      E4: { t: 'n', v: 7 },
      '!ref': 'C3:E4',
      '!merges': [{ s: { r: 2, c: 2 }, e: { r: 2, c: 3 } }],
    },
    'Main'
  );
  const document = XlsxDocument.fromBase64(XLSX.write(book, { type: 'base64', bookType: 'xlsx' }));
  const grid = document.readGrid();
  expect(grid.cells.map((row) => row.map((cell) => cell?.v))).toEqual([
    ['merged', undefined, undefined],
    [undefined, undefined, 7],
  ]);
  expect(grid.workbook.merges).toEqual([{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]);
  grid.cells[0][0]!.v = 'changed projection';
  expect(document.worksheet.C3.v).toBe('merged');
});

it('projects a worksheet without a used range as an empty grid', () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, {}, 'Empty');
  const document = XlsxDocument.fromBase64(XLSX.write(book, { type: 'base64', bookType: 'xlsx' }));
  expect(document.readGrid()).toEqual({ cells: [], workbook: { sources: {}, merges: [] } });
});

it('restores font and alignment styles across repeated save and reopen cycles on every worksheet', () => {
  const book = XLSX.utils.book_new();
  for (const name of ['Edited & Main', 'Retained']) {
    XLSX.utils.book_append_sheet(
      book,
      {
        C3: {
          t: 'n',
          v: 4,
          f: '2+2',
          s: {
            font: { bold: true, italic: true, underline: true, color: { rgb: '123456' } },
            fill: { patternType: 'solid', fgColor: { rgb: 'ABCDEF' } },
            alignment: { horizontal: 'right', vertical: 'center', wrapText: true },
          },
        },
        '!ref': 'C3',
      },
      name
    );
  }
  let content = XLSX.write(book, { type: 'base64', bookType: 'xlsx' });
  for (let cycle = 0; cycle < 3; cycle++) {
    const document = XlsxDocument.fromBase64(content);
    expect(document.worksheet.C3.s).toMatchObject({
      font: { bold: true, italic: true, underline: true, color: { rgb: '123456' } },
      fill: { fgColor: { rgb: 'ABCDEF' } },
      alignment: { horizontal: 'right', vertical: 'center', wrapText: true },
    });
    content = document.serialize([{ A: '4' }], [{ key: 'A' }]);
    const workbook = XLSX.read(content, { type: 'base64' });
    expect(workbook.Sheets['Edited & Main'].C3.f).toBe('2+2');
    expect(workbook.Sheets.Retained.C3.f).toBe('2+2');
    const retainedStyle = writtenCellStyle(content, 'C3', '/xl/worksheets/sheet2.xml');
    expect(retainedStyle.font.getElementsByTagName('b')).toHaveLength(1);
    expect(retainedStyle.alignment.getAttribute('horizontal')).toBe('right');
  }
});

it('serializes current merge geometry at the worksheet origin and removes deleted merges', () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    {
      C3: { t: 's', v: 'merged' },
      '!ref': 'C3:D3',
      '!merges': [{ s: { r: 2, c: 2 }, e: { r: 2, c: 3 } }],
    },
    'Main'
  );
  const document = XlsxDocument.fromBase64(XLSX.write(book, { type: 'base64', bookType: 'xlsx' }));
  const state = {
    sources: { '1:0': { r: 2, c: 2 } },
    merges: [{ s: { r: 1, c: 0 }, e: { r: 1, c: 1 } }],
  };
  const saved = XLSX.read(
    document.serialize(
      [
        { A: '', B: '' },
        { A: 'merged', B: '' },
      ],
      [{ key: 'A' }, { key: 'B' }],
      {},
      state
    ),
    { type: 'base64' }
  );
  expect(saved.Sheets.Main['!merges']).toEqual([{ s: { r: 3, c: 2 }, e: { r: 3, c: 3 } }]);
  const unmerged = XLSX.read(
    document.serialize(
      [{ A: 'merged' }],
      [{ key: 'A' }],
      {},
      { sources: { '0:0': { r: 2, c: 2 } }, merges: [] }
    ),
    { type: 'base64' }
  );
  expect(unmerged.Sheets.Main['!merges'] ?? []).toEqual([]);
});
