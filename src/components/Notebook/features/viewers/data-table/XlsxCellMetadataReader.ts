import type { CellStyle, WorkBook } from 'xlsx-js-style';

type Font = NonNullable<CellStyle['font']>;
type ParsedFont = Omit<Font, 'bold' | 'italic' | 'underline' | 'strike'> & {
  bold?: boolean | number;
  italic?: boolean | number;
  underline?: boolean | number;
  strike?: boolean | number;
};

/** The codec's parsed tables and package entries are not included in its public typings. */
interface ParsedWorkbook extends WorkBook {
  files?: Record<string, { content: Uint8Array }>;
  keys?: string[];
  Styles?: {
    Fonts: ParsedFont[];
    Fills: NonNullable<CellStyle['fill']>[];
    Borders: NonNullable<CellStyle['border']>[];
    CellXf: {
      fontId?: number;
      fillId?: number;
      borderId?: number;
      alignment?: CellStyle['alignment'];
    }[];
  };
}

const elements = (xml: Document, name: string) => Array.from(xml.getElementsByTagNameNS('*', name));

/** Restore cell metadata using package relationships, never worksheet-order filename guesses. */
export function restoreWorkbookCellMetadata(workbook: WorkBook): void {
  const parsed = workbook as ParsedWorkbook;
  const { files, Styles: styles } = parsed;
  if (!files || !styles) throw new Error('Workbook style tables are unavailable');
  const read = (path: string): Document => {
    const file = files[path];
    if (!file) throw new Error(`Missing workbook part: ${path}`);
    const xml = new DOMParser().parseFromString(
      new TextDecoder().decode(file.content),
      'application/xml'
    );
    if (xml.getElementsByTagName('parsererror').length)
      throw new Error(`Invalid workbook XML: ${path}`);
    return xml;
  };
  const resolve = (source: string, target: string) =>
    new URL(target, `https://workbook.invalid/${source}`).pathname.slice(1);
  try {
    const root = elements(read('_rels/.rels'), 'Relationship').find(
      (rel) =>
        rel.getAttribute('Type')?.endsWith('/officeDocument') &&
        rel.getAttribute('TargetMode') !== 'External'
    );
    if (!root?.getAttribute('Target')) throw new Error('Missing workbook relationship');
    const workbookPath = resolve('', root.getAttribute('Target')!);
    const slash = workbookPath.lastIndexOf('/');
    const relPath = `${workbookPath.slice(0, slash + 1)}_rels/${workbookPath.slice(slash + 1)}.rels`;
    const relationships = new Map(
      elements(read(relPath), 'Relationship').map((rel) => [rel.getAttribute('Id'), rel])
    );
    for (const sheet of elements(read(workbookPath), 'sheet')) {
      const name = sheet.getAttribute('name');
      const id = sheet.getAttributeNS(
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
        'id'
      );
      const rel = relationships.get(id);
      if (!rel || rel.getAttribute('TargetMode') === 'External')
        throw new Error('Invalid worksheet relationship');
      if (!rel.getAttribute('Type')?.endsWith('/worksheet')) continue;
      const target = rel.getAttribute('Target');
      if (!name || !target || !workbook.Sheets[name]) throw new Error('Missing worksheet');
      for (const node of elements(read(resolve(workbookPath, target)), 'c')) {
        const address = node.getAttribute('r');
        const cell = address ? workbook.Sheets[name][address] : undefined;
        if (!cell) continue;
        // The codec synthesizes zero for formula cells with no cached result.
        // Preserve absence so reopening cannot present an uncomputed result as zero.
        if (cell.f && !node.getElementsByTagNameNS('*', 'v')[0]?.textContent) {
          delete cell.v;
          delete cell.w;
          if (cell.t === 'z') cell.t = 'n';
        }
        const index = Number(node.getAttribute('s') ?? 0);
        const xf = Number.isInteger(index) && index >= 0 ? styles.CellXf[index] : undefined;
        if (!xf) throw new Error(`Invalid cell style index: ${node.getAttribute('s')}`);
        const font = styles.Fonts[xf.fontId ?? 0];
        const style: CellStyle = {
          font: font
            ? {
                ...font,
                bold: Boolean(font.bold),
                italic: Boolean(font.italic),
                underline: Boolean(font.underline),
                strike: Boolean(font.strike),
              }
            : undefined,
          fill: styles.Fills[xf.fillId ?? 0],
          border: styles.Borders[xf.borderId ?? 0],
          alignment: xf.alignment,
        };
        cell.s = structuredClone(style);
      }
    }
  } finally {
    // Package bytes are needed only while restoring the document model.
    delete parsed.files;
    delete parsed.keys;
  }
}
