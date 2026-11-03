import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backend = resolve(root, process.argv[2] || '../endurance-canva-backend');
const target = resolve(root, 'src/generated/contracts');
await mkdir(target, { recursive: true });
const files = ['lesson.schema.json', 'catalog.v1.json', 'example.v1.json', 'validation.js'];
const hashes = {};
for (const name of files) {
  const data = await readFile(resolve(backend, 'contracts', name));
  hashes[name] = createHash('sha256').update(data).digest('hex');
  await writeFile(resolve(target, name), data);
}
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: backend, encoding: 'utf8' }).trim();
const contractChanges = execFileSync('git', ['status', '--porcelain', '--', 'contracts'], { cwd: backend, encoding: 'utf8' }).trim();
await writeFile(resolve(target, 'provenance.json'), JSON.stringify({ repository: 'mkmilan/endurance-canva-backend', commit, workingTreeContractChanges: Boolean(contractChanges), files: hashes }, null, 2) + '\n');
console.log(`Synced ${files.length} contracts from backend ${commit.slice(0, 7)}${contractChanges ? ' (working tree)' : ''}.`);
