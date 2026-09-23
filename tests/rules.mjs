import ts from 'typescript';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ft-rules-'));
try {
  for (const name of ['catalog', 'progress']) {
    const source = await fs.readFile(
      `src/features/practice/lib/${name}.ts`,
      'utf8',
    );
    const js = ts
      .transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.ES2022,
          target: ts.ScriptTarget.ES2022,
        },
      })
      .outputText.replace("'./catalog'", "'./catalog.mjs'");
    await fs.writeFile(path.join(temp, name + '.mjs'), js);
  }
  const { words, grammar } = await import(
    pathToFileURL(path.join(temp, 'catalog.mjs'))
  );
  const { freshProgress, parseProgress, completion, demoScore, grammarResult, restartGrammar } = await import(
    pathToFileURL(path.join(temp, 'progress.mjs'))
  );
  const p = freshProgress();
  const exam = freshProgress();
  exam.grammarAttempts = grammar.map((g, i) => ({id:String(i), topic:g.id, variant:0, selected:0, correct:i<24, at:''}));
  assert.equal(grammarResult(exam).passed, true);
  exam.grammarAttempts[23].correct = false;
  assert.equal(grammarResult(exam).passed, false);
  const retake = restartGrammar(exam);
  assert.equal(retake.grammarAttempts.length, 0);
  assert.equal(retake.grammarHistory.length, 1);
  assert.equal(new Set(retake.grammarOrder).size, grammar.length);
  assert.notDeepEqual(retake.grammarOrder, grammar.map((_, i)=>i));
  assert.deepEqual(parseProgress(JSON.stringify(retake)).grammarOrder, retake.grammarOrder);
  exam.grammarAttempts.pop();
  assert.equal(grammarResult(exam).finished, false);
  const early = freshProgress();
  early.grammarAttempts = exam.grammarAttempts.slice(0, 7).map(a => ({...a, correct:false}));
  assert.equal(grammarResult(early).failedEarly, true);
  early.grammarAttempts.pop();
  assert.equal(grammarResult(early).finished, false);

  assert.equal(completion(p).ready, false);
  for (const scenario of ['pass', 'retry', 'error']) {
    assert.equal(demoScore(scenario, 2, 0).passed, false);
    assert.equal(demoScore(scenario, 0.2, 0.2).passed, false);
  }
  assert.equal(demoScore('error', 2, 0.2).status, 'error');
  assert.equal(demoScore('retry', 2, 0.2).passed, false);
  for (const w of words)
    p.attempts.push({
      id: w.id,
      itemId: w.id,
      at: new Date().toISOString(),
      source: 'sample',
      scenario: 'pass',
      ...demoScore('pass', 2, 0.2),
      duration: 2,
      human: 'not_reviewed',
    });
  assert.equal(completion(p).ready, false);
  p.attempts.push({ ...p.attempts[0], id: 'duplicate' });
  assert.equal(completion(p).pronunciation, words.length);
  p.attempts.push({
    ...p.attempts[0],
    id: 'later-silence',
    ...demoScore('pass', 2, 0),
  });
  assert.equal(completion(p).pronunciation, words.length);
  for (const g of grammar) {
    assert.equal(g.variants.length, 1);
    assert.equal(g.variants[0].options.length, 2);
    for (const v of g.variants) assert.ok(v.options[v.answer]);
    p.grammarAttempts.push({
      id: g.id,
      topic: g.id,
      variant: 0,
      selected: g.variants[0].answer,
      correct: true,
      at: new Date().toISOString(),
    });
  }
  assert.equal(completion(p).ready, true);
  p.grammarAttempts.push({ ...p.grammarAttempts[0], id: 'repeat' });
  assert.equal(completion(p).done, words.length + grammar.length);
  assert.deepEqual(completion(parseProgress(JSON.stringify(p))), completion(p));
  assert.equal(completion(parseProgress('{broken')).done, 0);
  assert.equal(
    completion(parseProgress(JSON.stringify({ ...p, version: 'stale' }))).done,
    0,
  );
  const corrupted = parseProgress(
    JSON.stringify({
      ...p,
      variants: {
        [grammar[0].id]: -1,
        [grammar[1].id]: 'oops',
        [grammar[2].id]: 99,
      },
    }),
  );
  assert.equal(corrupted.variants[grammar[0].id], 0);
  assert.equal(corrupted.variants[grammar[1].id], 0);
  assert.equal(corrupted.variants[grammar[2].id], 0);
  console.log(
    'PASS: 10 rule groups — prerequisites, silence, short audio, errors, retry scores, unique completion, grammar variants, persisted progress, invalid/stale data, corrupted variant recovery.',
  );
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
