import { expect, it } from 'vitest';
import { xlsxCellFormat } from './XlsxCellFormat';

it('overrides explicit false flags without discarding unrelated source style fields', () => {
  const original = {
    font: { bold: true, italic: true, underline: true, name: 'Arial', sz: 18 },
    alignment: { wrapText: true },
  };
  const style = xlsxCellFormat(original, {
    bold: false,
    italic: false,
    underline: false,
    textAlign: 'right',
  });
  expect(style.font).toEqual({
    bold: false,
    italic: false,
    underline: false,
    name: 'Arial',
    sz: 18,
  });
  expect(style.alignment).toEqual({ wrapText: true, horizontal: 'right' });
  expect(original.font.bold).toBe(true);
});

it('preserves the document fill when only font formatting changes', () => {
  const style = xlsxCellFormat(
    { fill: { patternType: 'solid', fgColor: { rgb: '123456' } } },
    { bold: true }
  );
  expect(style.fill).toMatchObject({ patternType: 'solid', fgColor: { rgb: '123456' } });
  expect(style.font?.bold).toBe(true);
});
