import * as XLSX from 'xlsx-js-style';
import { expect, it } from 'vitest';
import { XlsxDocument } from './XlsxDocument';

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
