import * as XLSX from 'xlsx-js-style';

interface WorkbookArchive {
  read(content: string, options: { type: 'base64' }): unknown;
  find(archive: unknown, path: string): { content: Uint8Array } | null;
}

/** Inspect emitted OOXML rather than relying on the codec's partial style reader. */
export function writtenCellStyle(
  content: string,
  address: string,
  worksheetPath = '/xl/worksheets/sheet1.xml'
) {
  const zip = XLSX.CFB as WorkbookArchive;
  const archive = zip.read(content, { type: 'base64' });
  const xml = (path: string) => {
    const entry = zip.find(archive, path);
    if (!entry) throw new Error(`Missing workbook entry: ${path}`);
    return new DOMParser().parseFromString(
      new TextDecoder().decode(entry.content),
      'application/xml'
    );
  };
  const sheet = xml(worksheetPath);
  const styles = xml('/xl/styles.xml');
  const cell = Array.from(sheet.getElementsByTagName('c')).find(
    (cell) => cell.getAttribute('r') === address
  );
  if (!cell) throw new Error(`Missing cell: ${address}`);
  const xf =
    styles.getElementsByTagName('cellXfs')[0].children[Number(cell.getAttribute('s') || 0)];
  return {
    font: styles.getElementsByTagName('fonts')[0].children[Number(xf.getAttribute('fontId') || 0)],
    fill: styles.getElementsByTagName('fills')[0].children[Number(xf.getAttribute('fillId') || 0)],
    alignment: xf.getElementsByTagName('alignment')[0],
  };
}
