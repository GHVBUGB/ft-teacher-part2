// Integration test with synthetic scores and an in-memory localStorage.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const temp = await mkdtemp(join(tmpdir(), 'ft-round-store-'));
const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) };
try {
  for (const name of ['score', 'stageProgress', 'assessmentRound']) {
    const source = await readFile(`src/features/practice/lib/${name}.ts`, 'utf8');
    await writeFile(join(temp, `${name}.mjs`), ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText.replace(/from (['"])\.\/(\w+)\1/g, "from './$2.mjs'"));
  }
  // Exercise the production store, stripping only the React hook wrapper/imports.
  let source = await readFile('src/features/practice/useStageTraining.ts', 'utf8');
  source = source.slice(0, source.indexOf('export function useStageTraining'))
    .replace(/^import .* from '(react|\.\/lib\/previewMode)';\n/gm, '')
    .replace('function createStore(', 'export function createStore(')
    .replaceAll("'./lib/", "'./");
  await writeFile(join(temp, 'store.mjs'), ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText.replace(/from (['"])\.\/(\w+)\1/g, "from './$2.mjs'"));
  const { createStore } = await import(pathToFileURL(join(temp, 'store.mjs')));
  const { items: bank } = JSON.parse(await readFile('docs/content/ft-target-words-v2.json', 'utf8'));
  const context = { teacherId: 'SYNTHETIC', enrollmentId: 'SYNTHETIC', contentVersion: 'ft-target-words-v2-round-v1' };
  let store = createStore(context, bank, 'test', false);
  assert.equal(store.getSnapshot().round, null);
  store.start();
  const ids = [...store.getSnapshot().round.ids];
  let serial = 0;
  const record = (id, score = 90) => {
    const item = bank.find(i => i.id === id);
    store.record(id, { id: `synthetic-${++serial}`, text: item.text, kind: item.kind, result: { pronunciation: score, fluency: score, rhythm: score, integrity: 100 } });
  };
  record(ids[30]);
  assert.equal(store.status().sentence.passed, 0);
  assert.equal(store.status().sentence.unlocked, false);
  ids.slice(0, 29).forEach(id => record(id));
  assert.equal(store.status().word.passed, 29);
  assert.equal(store.status().sentence.unlocked, false);
  record(ids[29], 79);
  assert.equal(store.status().word.passed, 29);
  const replacement = store.replace(ids[29]);
  assert.ok(replacement && !ids.includes(replacement));
  record(ids[29]); // Stale result from replaced question must not change progress.
  assert.equal(store.status().word.passed, 29);
  record(replacement, 80);
  assert.equal(store.status().word.passed, 30);
  assert.equal(store.status().sentence.unlocked, true);
  assert.equal(store.replace(replacement), null);
  ids.slice(30, 49).forEach(id => record(id));
  assert.equal(store.status().sentence.passed, 19);
  assert.equal(store.status().pronunciationComplete, false);
  record(ids[49], 80);
  assert.equal(store.status().sentence.passed, 20);
  assert.equal(store.status().pronunciationComplete, true);
  const saved = store.getSnapshot();
  store = createStore(context, bank, 'test', false);
  store.start();
  assert.deepEqual(store.getSnapshot().round, saved.round);
  assert.equal(store.status().word.passed, 30);
  assert.equal(store.status().sentence.passed, 20);
  assert.equal(store.status().pronunciationComplete, true);
  console.log('PASS formal round store: early sentence rejected; 29/30 locked; failed replacement; stale result ignored; 30/30 unlock; 19/20 incomplete; 20/20 complete; refresh retains completion');
} finally { await rm(temp, { recursive: true, force: true }); }
