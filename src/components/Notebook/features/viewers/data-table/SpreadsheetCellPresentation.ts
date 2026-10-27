import type { CSSProperties } from 'react';
import type { CellStyle, CellStyleColor } from 'xlsx-js-style';
import type { CellFormat } from './SpreadsheetSnapshot';

export interface ImportedCellPresentation {
  format: CellFormat;
  fontFamily?: string;
  fontSize?: string;
  vertical?: 'top' | 'center' | 'bottom';
}

function color(value?: CellStyleColor): string | undefined {
  const rgb = value?.rgb?.replace(/^#/, '');
  if (!rgb || !/^(?:[a-f\d]{6}|[a-f\d]{8})$/i.test(rgb)) return undefined;
  return `#${rgb.slice(-6).toUpperCase()}`;
}

/** The document reader has already normalized style shape, flags and theme RGB values. */
export function importedCellPresentation(style: CellStyle): ImportedCellPresentation {
  return {
    format: {
      bold: Boolean(style.font?.bold),
      italic: Boolean(style.font?.italic),
      underline: Boolean(style.font?.underline),
      color: color(style.font?.color),
      backgroundColor: style.fill?.patternType === 'none' ? undefined : color(style.fill?.fgColor),
      textAlign: style.alignment?.horizontal,
    },
    fontFamily: style.font?.name,
    fontSize: style.font?.sz ? `${style.font.sz}pt` : undefined,
    vertical: style.alignment?.vertical,
  };
}

/** One projection for inherited presentation, explicit user overrides and layout alignment. */
export function spreadsheetCellPresentation(
  format: CellFormat | undefined,
  imported: ImportedCellPresentation | undefined,
  numeric: boolean
): {
  cellStyle: CSSProperties;
  textStyle: CSSProperties;
  justifyContent: string;
  alignItems: string;
} {
  const effective = { ...imported?.format, ...format };
  const horizontal = effective.textAlign ?? (numeric ? 'right' : 'left');
  return {
    cellStyle: { backgroundColor: effective.backgroundColor, textAlign: horizontal },
    textStyle: {
      color: effective.color,
      fontWeight: effective.bold ? 700 : 400,
      fontStyle: effective.italic ? 'italic' : 'normal',
      textDecoration: effective.underline ? 'underline' : 'none',
      fontFamily: imported?.fontFamily,
      fontSize: imported?.fontSize,
    },
    justifyContent:
      horizontal === 'center' ? 'center' : horizontal === 'right' ? 'flex-end' : 'flex-start',
    alignItems:
      imported?.vertical === 'center'
        ? 'center'
        : imported?.vertical === 'bottom'
          ? 'flex-end'
          : 'flex-start',
  };
}
