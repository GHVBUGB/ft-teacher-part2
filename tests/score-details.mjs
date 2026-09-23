import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getScoreDetails } from '../src/features/practice/lib/scoreDetails.ts';
import { calculateScore } from '../src/features/practice/lib/score.ts';

let checks = 0;
const check = (name, fn) => { fn(); checks += 1; console.log(`PASS ${name}`); };
const fixtures = new URL('../artifacts/testing/2026-09-09-speechsuper-live/', import.meta.url);
const wordRaw = JSON.parse(await readFile(new URL('T01-word-result.json', fixtures), 'utf8'));
const sentenceRaw = JSON.parse(await readFile(new URL('T02-sentence-result.json', fixtures), 'utf8'));

check('Recorded SpeechSuper word dimensions and phonemes retain original values', () => {
  const data = getScoreDetails('word', wordRaw, wordRaw);
  assert.deepEqual(data.dimensions.map(d => d.value), [96, 100, 98]);
  assert.equal(data.words[0].word, 'apple');
  assert.equal(data.words[0].score, 96);
  assert.deepEqual(data.words[0].phonemes.map(p => p.score), [100, 100, 85]);
  assert.deepEqual(data.words[0].phonemes[0].feedback, []);
});
check('Recorded sentence exposes 277 words/min without limiting speed to 100', () => {
  const data = getScoreDetails('sentence', sentenceRaw);
  assert.equal(data.words.length, 5);
  assert.deepEqual(data.dimensions.find(d => d.key === 'speed'), {key:'speed', label:'速度', value:277, unit:'词/分钟'});
  assert.equal(data.words[4].phonemes[0].score, 79);
  assert.deepEqual(data.words[4].phonemes[0].feedback, []);
  assert.equal(data.tone, '降调');
});
check('Self-calculated total stays independent from provider overall', () => {
  const metrics = { pronunciation:76, fluency:34, rhythm:70, integrity:100, overall:70 };
  assert.equal(calculateScore('sentence', metrics).value, 71.5);
  const data = getScoreDetails('sentence', metrics, {...sentenceRaw, overall:99});
  assert.equal(data.dimensions.find(d => d.key === 'pronunciation').value,76);
  assert.ok(!data.dimensions.some(d => d.key === 'overall'));
});
check('Missing dimensions and word detail remain missing rather than fabricated', () => {
  const data = getScoreDetails('sentence', {pronunciation:90});
  assert.equal(data.words.length, 0);
  assert.equal(data.dimensions.filter(d => d.value === null).length, 4);
  assert.equal(data.tone, null);
  assert.deepEqual(data.feedback, []);
});
check('Synthetic Speechace phone list keeps explicit feedback and never invents others', () => {
  const raw = {word_score_list:[{word:'apple', quality_score:73, phone_score_list:[
    {phone:'AE', quality_score:62, sound_most_like:'EH', feedback:'Open your mouth wider.'},
    {phone:'P', quality_score:100},
  ]}]};
  const data = getScoreDetails('word', {pronunciation:73}, raw);
  assert.equal(data.words[0].score,73);
  assert.equal(data.words[0].phonemes[0].symbol,'AE');
  assert.equal(data.words[0].phonemes[0].recognized,'EH');
  assert.deepEqual(data.words[0].phonemes[0].feedback,['Open your mouth wider.']);
  assert.deepEqual(data.words[0].phonemes[1].feedback,[]);
  assert.deepEqual(data.dimensions.map(d=>d.value),[73,null,null]);
});
check('Returned string errors are mapped, unknown numeric codes are not guessed', () => {
  const raw = {words:[{word:'apple', pronunciation:52, readType:2, phonemes:[
    {phoneme:'æ', pronunciation:50, error_type:'Omission', inserted_before:['ə']},
    {phoneme:'l', pronunciation:55, error_type:'CustomCode'},
  ]}]};
  const data = getScoreDetails('word',{pronunciation:52},raw);
  assert.deepEqual(data.words[0].feedback,['朗读标记：2（接口原值）']);
  assert.deepEqual(data.words[0].phonemes[0].feedback,['漏读','前方插入音：ə']);
  assert.deepEqual(data.words[0].phonemes[1].feedback,['评测标记：CustomCode']);
});
check('Invalid/non-numeric values are not coerced into scores or diagnoses', () => {
  const data = getScoreDetails('word',{pronunciation:'90',stress:101,intelligibility:NaN},{words:[null, {}, {word:'test', quality_score:-1, phonemes:[null,{phoneme:'t',pronunciation:Infinity}]}]});
  assert.deepEqual(data.dimensions.map(d=>d.value),[null,null,null]);
  assert.equal(data.words.length,1);
  assert.equal(data.words[0].score,null);
  assert.equal(data.words[0].phonemes[0].score,null);
  assert.deepEqual(data.words[0].phonemes[0].feedback,[]);
});
check('Feedback objects are filtered rather than displaying arbitrary raw JSON', () => {
  const data = getScoreDetails('word',{pronunciation:80},{feedback:[{message:'Try again.'},{secret:'never show'},'Slow down.'],details:[{char:'apple',score:80}]});
  assert.deepEqual(data.feedback,['Try again.','Slow down.']);
  assert.deepEqual(data.words[0],{word:'apple',score:80,phonemes:[],feedback:[]});
});
check('Unrecognized codes cannot access object prototype properties', () => {
  const data = getScoreDetails('word',{pronunciation:80},{error_type:'constructor',rear_tone:'toString'});
  assert.deepEqual(data.feedback,['评测标记：constructor']);
  assert.equal(data.tone,'语调标记：toString');
});
console.log(`${checks} score-detail adapter cases passed; no external assessment calls.`);
