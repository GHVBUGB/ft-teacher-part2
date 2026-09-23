import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Compile just these pure helpers without requiring a browser or changing project TS settings.
const temp = await mkdtemp(join(tmpdir(), 'ft-stage-test-'));
let checked = 0;
try {
  for (const name of ['score', 'stageProgress']) {
    const source = await readFile(new URL(`../src/features/practice/lib/${name}.ts`, import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText.replace(/from '\.\/score'/g, "from './score.mjs'");
    await writeFile(join(temp, `${name}.mjs`), compiled);
  }
  const { createStageProgress, restoreStageProgress, addStageAttempt, getStageStatus } = await import(pathToFileURL(join(temp, 'stageProgress.mjs')));
  const context = { teacherId: 'TEST-TEACHER', enrollmentId: 'TEST-ENROLLMENT', contentVersion: 'test-v1' };
  const words = Array.from({ length: 20 }, (_, index) => ({ id: `w${index}`, text: `word ${index}`, kind: 'word' }));
  const sentence = { id: 's0', text: 'This is a test.', kind: 'sentence' };
  const items = [...words, sentence];
  let clock = 0;
  function attempt(item, pronunciation = 80, extra = {}) {
    clock += 1;
    return { attemptId: `attempt-${clock}`, itemId: item.id, text: item.text, kind: item.kind, metrics: item.kind === 'word' ? { pronunciation } : { pronunciation, fluency: pronunciation, rhythm: pronunciation, integrity: 100 }, createdAt: new Date(Date.UTC(2026, 8, 10) + clock * 1000).toISOString(), ...extra };
  }
  function check(name, fn) { fn(); checked += 1; console.log(`PASS ${name}`); }
  let state = createStageProgress(context, items);
  check('New progress locks sentences', () => assert.equal(getStageStatus(state, items).sentence.unlocked, false));
  check('Local preview unlocks access without fabricating passed words', () => {
    const open = getStageStatus(state, items, true);
    assert.equal(open.sentence.unlocked, true);
    assert.equal(open.word.passed, 0);
    assert.equal(open.pronunciationComplete, false);
    const next = addStageAttempt(state, context, items, attempt(sentence), true);
    assert.equal(next.accepted, true);
    const restored = restoreStageProgress(JSON.stringify(next.state), context, items, true);
    assert.equal(getStageStatus(restored, items, true).sentence.passed, 1);
    assert.equal(getStageStatus(restored, items, true).word.passed, 0);
    assert.equal(getStageStatus(restored, items).sentence.passed, 0);
  });
  check('Sentence before word completion is rejected', () => assert.equal(addStageAttempt(state, context, items, attempt(sentence)).reason, 'stage_locked'));
  for (const word of words.slice(0, 19)) state = addStageAttempt(state, context, items, attempt(word)).state;
  check('19 of 20 words (95%) does not unlock next stage', () => {
    const status = getStageStatus(state, items);
    assert.equal(status.word.passed, 19);
    assert.equal(status.word.complete, false);
    assert.equal(status.sentence.unlocked, false);
  });
  state = addStageAttempt(state, context, items, attempt(words[19], 79.9)).state;
  check('79.9 fails and preserves stage lock', () => {
    assert.equal(getStageStatus(state, items).items.w19.passed, false);
    assert.equal(getStageStatus(state, items).sentence.unlocked, false);
  });
  const pass = attempt(words[19], 80, { metrics: { pronunciation: 80, overall: 0, stress: 3, intelligibility: 4 } });
  state = addStageAttempt(state, context, items, pass).state;
  check('80 exactly passes all 20 words and unlocks sentences; provider overall is ignored', () => {
    const status = getStageStatus(state, items);
    assert.equal(status.word.passed, 20);
    assert.equal(status.sentence.unlocked, true);
    assert.equal(status.items.w19.lastScore, 80);
    assert.equal(state.attempts.at(-1).metrics.overall, undefined);
  });
  check('Duplicate response does not create another attempt or completion', () => {
    const next = addStageAttempt(state, context, items, pass);
    assert.equal(next.reason, 'duplicate');
    assert.equal(next.state.attempts.length, state.attempts.length);
  });
  state = addStageAttempt(state, context, items, attempt(words[19], 30)).state;
  check('Previously passed item remains passed after a lower retry', () => {
    const status = getStageStatus(state, items);
    assert.equal(status.items.w19.bestScore, 80);
    assert.equal(status.items.w19.lastScore, 30);
    assert.equal(status.items.w19.attemptCount, 3);
    assert.equal(status.sentence.unlocked, true);
  });
  check('Missing/invalid required dimensions, error status, unsupported kind and unknown text cannot count', () => {
    for (const extra of [
      { metrics: { overall: 100 } },
      { metrics: { pronunciation: NaN } },
      { metrics: { pronunciation: '100' } },
      { metrics: { pronunciation: 101 } },
      { metrics: { pronunciation: -1 } },
      { metrics: { pronunciation: Infinity } },
      { status: 'error' },
      { status: 'invalid' },
      { kind: 'speech' },
      { itemId: 'unknown' },
      { text: 'Changed text' },
      { createdAt: 'not a date' },
    ]) assert.equal(addStageAttempt(state, context, items, attempt(words[0], 100, extra)).accepted, false);
    assert.equal(addStageAttempt(state, context, items, attempt(sentence, 100, { metrics: { pronunciation: 100, fluency: 100, integrity: 100 } })).accepted, false);
  });
  const sample = attempt(sentence, 80, { metrics: { overall: 100, pronunciation: 76, fluency: 34, rhythm: 70, integrity: 100 } });
  state = addStageAttempt(state, context, items, sample).state;
  check('Sentence uses dimension formula (71.5) and must independently reach 80', () => {
    assert.equal(getStageStatus(state, items).items.s0.lastScore, 71.5);
    assert.equal(getStageStatus(state, items).sentence.complete, false);
  });
  state = addStageAttempt(state, context, items, attempt(sentence, 80)).state;
  check('Every word and sentence passed completes pronunciation', () => assert.equal(getStageStatus(state, items).pronunciationComplete, true));
  check('Valid JSON restores scores, dimensions, rules and completion', () => {
    const restored = restoreStageProgress(JSON.stringify(state), context, items);
    assert.deepEqual(restored, state);
    assert.equal(getStageStatus(restored, items).pronunciationComplete, true);
  });
  check('Teacher, enrollment, content-version, text and catalog changes invalidate saved progress', () => {
    for (const field of ['teacherId', 'enrollmentId', 'contentVersion']) assert.equal(restoreStageProgress(state, { ...context, [field]: 'different' }, items).attempts.length, 0);
    assert.equal(restoreStageProgress(state, context, [{ ...words[0], text: 'changed' }, ...items.slice(1)]).attempts.length, 0);
    assert.equal(restoreStageProgress(state, context, items.slice(1)).attempts.length, 0);
  });
  check('Empty stages fail closed; duplicate catalog IDs are rejected', () => {
    assert.equal(getStageStatus(createStageProgress(context, []), []).pronunciationComplete, false);
    assert.equal(getStageStatus(createStageProgress(context, [sentence]), [sentence]).sentence.unlocked, false);
    const wordOnly = words;
    assert.equal(getStageStatus(restoreStageProgress(state, context, wordOnly), wordOnly).pronunciationComplete, false);
    assert.equal(getStageStatus(createStageProgress(context, [words[0], words[0]]), [words[0], words[0]]).configurationValid, false);
  });
  check('Tampered total, pass flag and saved rule are recomputed; old demo scores cannot migrate', () => {
    const fresh = createStageProgress(context, items);
    const low = attempt(words[0], 1);
    fresh.attempts = [{ ...low, status: 'scored', score: 100, passed: true, rule: 'fake-rule' }];
    const restored = restoreStageProgress(fresh, context, items);
    assert.equal(restored.attempts[0].score, 1);
    assert.equal(restored.attempts[0].rule, 'word-v1');
    assert.equal(getStageStatus(restored, items).word.passed, 0);
    assert.equal(restoreStageProgress({ version: 'demo-2026-09-v1', attempts: [{ itemId: 'w0', score: 92, passed: true }] }, context, items).attempts.length, 0);
  });
  check('Restoration rejects sentences recorded before word completion even if array is reordered', () => {
    const early = { ...attempt(sentence, 100), createdAt: new Date(Date.UTC(2026, 8, 9)).toISOString(), status: 'scored' };
    const restored = restoreStageProgress({ ...state, attempts: [...state.attempts.filter(entry => entry.kind === 'word'), early] }, context, items);
    assert.equal(restored.attempts.some(entry => entry.kind === 'sentence'), false);
    assert.equal(getStageStatus(restored, items).sentence.complete, false);
  });
  check('Repeated restored IDs cannot inflate stage counts and invalid JSON fails closed', () => {
    const restored = restoreStageProgress({ ...state, attempts: [...state.attempts, ...state.attempts] }, context, items);
    assert.equal(restored.attempts.length, state.attempts.length);
    assert.equal(getStageStatus(restored, items).word.passed, 20);
    for (const raw of [null, '{', '[]', '{}', 9]) assert.equal(restoreStageProgress(raw, context, items).attempts.length, 0);
  });
  check('Backdated new attempts are rejected', () => assert.equal(addStageAttempt(state, context, items, attempt(words[0], 100, { createdAt: new Date(Date.UTC(2026, 8, 9)).toISOString() })).reason, 'out_of_order'));
  console.log(`PASS ${checked} stage progress scenarios`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
