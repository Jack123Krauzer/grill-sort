import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const stage = await mkdtemp(join(root, '.build-'));

try {
  const compiler = process.env.GRILL_TS_COMPILER || join(root, 'node_modules/typescript/bin/tsc');
  const compile = spawnSync(process.execPath, [compiler, '--project', 'tsconfig.json', '--outDir', join(stage, 'js')], {
    cwd: root, stdio: 'inherit',
  });
  if (compile.error || compile.status !== 0) throw compile.error || new Error('TypeScript compilation failed.');

  await cp(join(root, 'public'), stage, { recursive: true });
  await cp(join(root, 'index.html'), join(stage, 'index.html'));
  await cp(join(root, 'src/styles.css'), join(stage, 'styles.css'));

  const files = (await readdir(stage, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => relative(stage, resolve(entry.parentPath, entry.name)).replaceAll('\\', '/'))
    .sort();
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file).update('\0').update(await readFile(join(stage, file))).update('\0');
  }

  const cacheName = `skewer-shift-${hash.digest('hex').slice(0, 16)}`;
  const worker = await readFile(join(root, 'tools/service-worker.js'), 'utf8');
  await writeFile(join(stage, 'sw.js'), `const CACHE = ${JSON.stringify(cacheName)};\nconst FILES = ${JSON.stringify(files.map((file) => `/${file}`))};\n${worker}`);

  const output = join(root, 'dist');
  await mkdir(output, { recursive: true });
  // Files from the previous build may still be referenced by a running game.
  // Replace the entry page last so a newly loaded game has all of its assets.
  for (const entry of await readdir(stage, { withFileTypes: true })) {
    if (entry.name !== 'index.html') await cp(join(stage, entry.name), join(output, entry.name), { recursive: true });
  }
  await rename(join(stage, 'index.html'), join(output, 'index.html'));
  console.log(`Built ${files.length} assets in dist/ (${cacheName}).`);
} finally {
  await rm(stage, { recursive: true, force: true });
}
