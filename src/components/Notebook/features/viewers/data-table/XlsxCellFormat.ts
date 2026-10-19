import type { CellStyle, CellStyleColor } from 'xlsx-js-style';
import type { CellFormat } from './SpreadsheetSnapshot';

type ParsedStyle = CellStyle & {
  patternType?: 'solid' | 'none';
  fgColor?: CellStyleColor;
  bgColor?: CellStyleColor;
};

/** Translate editor overrides and the reader's flattened fill into the writer's style shape. */
export function xlsxCellFormat(original: ParsedStyle | undefined, format: CellFormat): CellStyle {
  const style: CellStyle = { ...original };
  if (!style.fill && original?.patternType) {
    style.fill = {
      patternType: original.patternType,
      fgColor: original.fgColor,
      bgColor: original.bgColor,
    };
  }
  if (
    format.bold !== undefined ||
    format.italic !== undefined ||
    format.underline !== undefined ||
    format.color !== undefined
  ) {
    style.font = { ...style.font };
    if (format.bold !== undefined) style.font.bold = format.bold;
    if (format.italic !== undefined) style.font.italic = format.italic;
    if (format.underline !== undefined) style.font.underline = format.underline;
    if (format.color !== undefined)
      style.font.color = { rgb: format.color.replace(/^#/, '').toUpperCase() };
  }
  if (format.backgroundColor !== undefined) {
    style.fill = {
      ...style.fill,
      patternType: 'solid',
      fgColor: { rgb: format.backgroundColor.replace(/^#/, '').toUpperCase() },
    };
  }
  if (format.textAlign !== undefined)
    style.alignment = { ...style.alignment, horizontal: format.textAlign };
  return style;
}
