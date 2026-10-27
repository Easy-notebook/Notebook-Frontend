import type { CSSProperties, ReactElement } from 'react';
import type { ListChildComponentProps } from 'react-window';

export type SpreadsheetRowRenderer = (index: number, style: CSSProperties) => ReactElement;

/** react-window treats its child as a component type: keep that identity stable across edits. */
export function VirtualSpreadsheetRow({
  index,
  style,
  data,
}: ListChildComponentProps<SpreadsheetRowRenderer>) {
  return data(index, style);
}
