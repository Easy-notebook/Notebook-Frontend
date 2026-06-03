import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The Phase-3 command files live in core/commands/ (a subdirectory the
 * top-level core-import-restrictions guard does not recurse into). They must
 * obey the SAME rules: only prosemirror-* / remark-stack / relative imports,
 * and no React / Zustand / browser-global references.
 */
const commandsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'commands');
const intentsFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'intents.ts');

const FORBIDDEN_IMPORT = /\bfrom\s+['"]([^'"]+)['"]/g;
const ALLOWED_PACKAGE =
  /^prosemirror-|^remark|^unified$|^mdast(-|$)|^micromark|^unist(-|$)|^vfile|^\.\.?\//;
const FORBIDDEN_GLOBALS = /\b(window|document|fetch|localStorage)\b/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name) && !e.name.includes('.test.'))
    .map((e) => join(dir, e.name));
}

describe('core/commands import restrictions', () => {
  const files = [...sourceFiles(commandsDir), intentsFile];

  it('finds the command source files', () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  it.each(files.map((f) => [f.split('/core/')[1], f] as const))(
    'core/%s imports only prosemirror-* and relative modules',
    (_label, file) => {
      const src = readFileSync(file, 'utf8');
      const offenders: string[] = [];
      for (const m of src.matchAll(FORBIDDEN_IMPORT)) {
        const spec = m[1];
        if (spec.startsWith('node:')) continue;
        if (!ALLOWED_PACKAGE.test(spec)) offenders.push(spec);
      }
      expect(offenders, `forbidden imports in ${file}`).toEqual([]);
    }
  );

  it.each(files.map((f) => [f.split('/core/')[1], f] as const))(
    'core/%s does not reference browser globals',
    (_label, file) => {
      const src = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(FORBIDDEN_GLOBALS.test(src), `browser global in ${file}`).toBe(false);
    }
  );
});
