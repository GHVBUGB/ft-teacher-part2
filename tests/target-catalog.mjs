import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const temp = await mkdtemp(join(tmpdir(), 'ft-v2-catalog-'));
try {
  for (const name of ['catalog', 'stageCatalog']) {
    const source = await readFile(`src/features/practice/lib/${name}.ts`, 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText.replace(/from (['"])\.\/catalog\1/g, "from './catalog.mjs'");
    await writeFile(join(temp, `${name}.mjs`), compiled);
  }
  const { stageItems } = await import(pathToFileURL(join(temp, 'stageCatalog.mjs')));
  const { CONTENT_VERSION } = await import(pathToFileURL(join(temp, 'catalog.mjs')));
  const manifest = JSON.parse(await readFile('docs/content/ft-target-words-v2.json', 'utf8'));
  assert.equal(CONTENT_VERSION, 'ft-target-words-v2-round-v1');
  assert.equal(stageItems.filter(i => i.kind === 'word').length, 41);
  assert.equal(stageItems.filter(i => i.kind === 'sentence').length, 58);
  assert.deepEqual(stageItems, manifest.items.map(({ id, text, kind }) => ({ id, text, kind })));
  assert.equal(new Set(stageItems.map(i => i.id)).size, 99);
  for (const kind of ['word', 'sentence']) {
    const items = stageItems.filter(i => i.kind === kind);
    assert.equal(new Set(items.map(i => i.text.toLowerCase())).size, items.length);
  }
  for (const item of manifest.items) {
    assert.ok(item.sources.length > 0);
    assert.ok(item.sources.every(cell => new RegExp(`^${item.kind === 'word' ? 'B' : 'D'}[0-9]+$`).test(cell)));
    assert.doesNotMatch(item.text, /\/|…|\.{2}|___/);
    if (item.kind === 'word') assert.doesNotMatch(item.text, /\s/);
    else assert.match(item.text, /[.!?]$/);
  }
  const at = cell => manifest.items.filter(i => i.sources.includes(cell)).map(i => i.text).sort();
  assert.deepEqual(at('B52'), ['bear', 'bears']);
  assert.deepEqual(at('B55'), ['kangaroo', 'kangaroos']);
  assert.equal(at('D48').length, 6);
  assert.deepEqual(at('B33'), []);
  assert.deepEqual(at('D50'), []);
  assert.deepEqual(manifest.deferred.map(i => i.cell).sort(), ['B33', 'D50']);
  console.log('PASS V2 catalog: 41 words / 58 sentences, unique IDs, source cells, slash expansion and exclusions');
} finally { await rm(temp, { recursive: true, force: true }); }
