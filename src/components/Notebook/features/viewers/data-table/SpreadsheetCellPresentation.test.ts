import { expect, it } from 'vitest';
import {
  importedCellPresentation,
  spreadsheetCellPresentation,
} from './SpreadsheetCellPresentation';

it('uses reader-resolved colors and point units without overwriting theme results', () => {
  const presentation = importedCellPresentation({
    font: { bold: true, color: { theme: 4, rgb: 'FF123456' }, name: 'Arial', sz: 18 },
    fill: { patternType: 'solid', fgColor: { theme: 5, tint: -0.5, rgb: '632523' } },
    alignment: { horizontal: 'right', vertical: 'bottom' },
  });
  expect(presentation).toMatchObject({
    format: { bold: true, color: '#123456', backgroundColor: '#632523', textAlign: 'right' },
    fontFamily: 'Arial',
    fontSize: '18pt',
    vertical: 'bottom',
  });
  expect(
    spreadsheetCellPresentation({ bold: false, textAlign: 'center' }, presentation, true)
  ).toMatchObject({
    textStyle: { fontWeight: 400, fontFamily: 'Arial', fontSize: '18pt' },
    cellStyle: { textAlign: 'center' },
    justifyContent: 'center',
    alignItems: 'flex-end',
  });
});

it('does not invent colors for unresolved themes or disabled fills', () => {
  const presentation = importedCellPresentation({
    font: { color: { theme: 999 } },
    fill: { patternType: 'none', fgColor: { rgb: 'FF0000' } },
  });
  expect(presentation.format.color).toBeUndefined();
  expect(presentation.format.backgroundColor).toBeUndefined();
  expect(spreadsheetCellPresentation(undefined, undefined, true).cellStyle.textAlign).toBe('right');
});
