import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Architectural guard: the core package MUST stay framework-free and store-free
 * so it can be extracted as a portable SDK. No React, no Zustand, no global
 * `window`/`document`/`fetch`, no app-internal imports (`@/…`, `@Store`, …).
 * Only `prosemirror-*` and relative `./` imports are allowed.
 */
const coreDir = join(dirname(fileURLToPath(import.meta.url)), '..');

const FORBIDDEN_IMPORT = /\bfrom\s+['"]([^'"]+)['"]/g;
const ALLOWED_PACKAGE = /^prosemirror-|^\.\.?\//; // prosemirror-* or relative
const FORBIDDEN_GLOBALS = /\b(window|document|fetch|localStorage)\b/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name) && !e.name.includes('.test.'))
    .map((e) => join(dir, e.name));
}

describe('core import restrictions', () => {
  const files = sourceFiles(coreDir);

  it('finds the scaffold source files', () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  it.each(files.map((f) => [f.split('/core/')[1], f] as const))(
    'core/%s imports only prosemirror-* and relative modules',
    (_label, file) => {
      const src = readFileSync(file, 'utf8');
      const offenders: string[] = [];
      for (const m of src.matchAll(FORBIDDEN_IMPORT)) {
        const spec = m[1];
        if (spec.startsWith('node:')) continue; // node builtins (none expected in core)
        if (!ALLOWED_PACKAGE.test(spec)) offenders.push(spec);
      }
      expect(offenders, `forbidden imports in ${file}`).toEqual([]);
    }
  );

  it.each(files.map((f) => [f.split('/core/')[1], f] as const))(
    'core/%s does not reference browser globals',
    (_label, file) => {
      // Strip comments so doc-comments mentioning `window` don't trip the guard.
      const src = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(FORBIDDEN_GLOBALS.test(src), `browser global in ${file}`).toBe(false);
    }
  );
});
