import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, dirname, extname, resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { ClaudeCodeTranscript } from '../src/utils/importFile/ClaudeCodeTranscript';
import { TranscriptCellDocument } from '../src/utils/importFile/TranscriptCellDocument';
import { NotebookSnapshotDocument } from '../src/services/autoSave/NotebookSnapshotDocument';

/** Usage: npm run import:claude -- [--out-dir DIRECTORY] FILE.txt [FILE.txt ...] */
async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out-dir');
  let outputDirectory: string | undefined;
  if (outIndex !== -1) {
    const value = args[outIndex + 1];
    if (!value || value.startsWith('--')) throw new Error('--out-dir requires a directory');
    outputDirectory = resolve(value);
    args.splice(outIndex, 2);
  }
  if (!args.length)
    throw new Error(
      'Usage: npm run import:claude -- [--out-dir DIRECTORY] FILE.txt [FILE.txt ...]'
    );
  const report = [];
  for (const file of args) {
    const sourcePath = resolve(file);
    if (extname(sourcePath).toLowerCase() !== '.txt')
      throw new Error(`Expected .txt: ${sourcePath}`);
    const bytes = await readFile(sourcePath);
    const source = bytes.toString('utf8');
    const parsed = new ClaudeCodeTranscript().parse(source, basename(sourcePath));
    const documents = parsed.cells
      .map(TranscriptCellDocument.read)
      .filter((document) => document !== null);
    const prompts = documents.filter((document) => document.heading !== null);
    const notebook = new NotebookSnapshotDocument({
      notebookId: randomUUID(),
      notebookTitle: parsed.title,
      cells: parsed.cells,
      tasks: [],
      timestamp: Date.now(),
    });
    const serialized = JSON.parse(notebook.content);
    serialized.metadata.import = {
      format: 'claude-code-semantic-v2',
      sourceFile: basename(sourcePath),
      sha256: createHash('sha256').update(bytes).digest('hex'),
      promptCount: prompts.length,
      // Retain the original export for audit/reconversion, including terminal spacing.
      sourceText: source,
    };
    const destination = join(
      outputDirectory ?? dirname(sourcePath),
      `${basename(sourcePath, extname(sourcePath))}.easynb`
    );
    await mkdir(dirname(destination), { recursive: true });
    // Never overwrite a previous notebook conversion implicitly.
    await writeFile(destination, JSON.stringify(serialized, null, 2) + '\n', { flag: 'wx' });
    const saved = JSON.parse(await readFile(destination, 'utf8'));
    if (saved.cells.length !== parsed.cells.length || saved.metadata.import.sourceText !== source)
      throw new Error(`Round-trip verification failed: ${destination}`);
    report.push({
      source: sourcePath,
      output: destination,
      cells: saved.cells.length,
      prompts: prompts.length,
      tools: documents.filter((document) => document.role === 'tool').length,
      codeCells: parsed.cells.filter((cell) => cell.type === 'code').length,
      tables: documents.filter((document) => document.kind === 'table').length,
      categories: Object.fromEntries(
        [...new Set(documents.map((document) => document.kind))].map((kind) => [
          kind,
          documents.filter((document) => document.kind === kind).length,
        ])
      ),
      sha256: saved.metadata.import.sha256,
    });
  }
  console.log(JSON.stringify(report, null, 2));
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
