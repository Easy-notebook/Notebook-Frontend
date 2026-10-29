/** One-time migration. Originals stay untouched; the runtime no longer reads the old artifact directory. */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
const id = process.argv[2];
if (!id) throw new Error('Usage: tsx scripts/migrate-notebook-artifacts-to-vfs.ts NOTEBOOK_ID');
const directory = join(
  homedir(),
  'Documents/EasyNotebook/agent-artifacts',
  createHash('sha256').update(id).digest('hex')
);
const endpoint = `http://127.0.0.1:8787/api/workspaces/${encodeURIComponent(id)}/files`;
async function execute(operation: unknown, request_id: string) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'execute', operation, request_id }),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(value));
  return value;
}
const catalog = await execute({ op: 'catalog', since: null }, 'migration-inspect');
const paths = new Set(catalog.entries.map((entry: { path: string }) => entry.path));
for (const name of await readdir(directory).catch((error) => {
  if (error.code === 'ENOENT') return [];
  throw error;
})) {
  if (!/^[a-f0-9-]{36}\.easynb$/.test(name)) continue;
  const content = await readFile(join(directory, name), 'utf8');
  const document = JSON.parse(content);
  if (document.notebook_id !== id) throw new Error('Artifact owner mismatch');
  const path = '/output/' + name;
  if (paths.has(path)) continue;
  await execute({ op: 'create', path, content }, 'migrate-' + name);
  console.log(JSON.stringify({ path, bytes: Buffer.byteLength(content) }));
}
