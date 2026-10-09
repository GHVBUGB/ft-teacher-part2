import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = readdirSync(new URL('./', import.meta.url))
  .filter(name => name.endsWith('.mjs') && name !== 'run.mjs').sort();
for (const file of files) {
  const run = spawnSync(process.execPath, ['--experimental-strip-types', `tests/${file}`], { stdio: 'inherit' });
  if (run.error) throw run.error;
  if (run.status !== 0) process.exit(run.status ?? 1);
}
console.log(`PASS all ${files.length} frontend test suites (no vendor calls)`);
