import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ScoreSummary from '../src/features/practice/ScoreSummary';
import '../src/features/practice/SpeechSuperPanel.css';
const sentenceWords = ['This', 'is', 'a', 'red', 'apple.'].map((word, i) => ({
  word,
  scores: { pronunciation: [100, 100, 77, 97, 93][i] },
  phonemes: [
    {
      phoneme: i === 2 ? 'ə' : 'æ',
      pronunciation: i === 2 ? 77 : 93,
      ...(i === 2 ? { feedback: '合成反馈：请检查本音素的发音。' } : {}),
    },
  ],
}));
const fixtures = [
  {
    name: '单词：发音99，供应商总分10',
    kind: 'word',
    metrics: {
      pronunciation: 99,
      stress: 100,
      intelligibility: 98,
      overall: 10,
    },
    raw: {
      words: [
        {
          word: 'apple',
          scores: { pronunciation: 99 },
          phonemes: [
            { phoneme: 'æ', pronunciation: 99 },
            { phoneme: 'p', pronunciation: 100 },
            { phoneme: 'əl', pronunciation: 98 },
          ],
        },
      ],
    },
  },
  {
    name: '句子：76 / 34 / 70，完整度100，供应商总分70',
    kind: 'sentence',
    metrics: {
      pronunciation: 76,
      fluency: 34,
      rhythm: 70,
      integrity: 100,
      speed: 166,
      overall: 70,
    },
    raw: { words: sentenceWords },
  },
  {
    name: '句子：完整度50',
    kind: 'sentence',
    metrics: {
      pronunciation: 76,
      fluency: 34,
      rhythm: 70,
      integrity: 50,
      speed: 83,
      overall: 70,
    },
    raw: { words: sentenceWords },
  },
  {
    name: '句子：缺少韵律',
    kind: 'sentence',
    metrics: {
      pronunciation: 76,
      fluency: 34,
      integrity: 100,
      speed: 166,
      overall: 70,
    },
    raw: { words: sentenceWords },
  },
  {
    name: '参考图结构：五项维度与逐词列表',
    kind: 'sentence',
    metrics: {
      pronunciation: 94,
      fluency: 99,
      rhythm: 98,
      integrity: 100,
      speed: 166,
      overall: 95,
    },
    raw: { words: sentenceWords },
  },
];
function Harness() {
  const [i, setI] = useState(1);
  const f = fixtures[i];
  return (
    <main
      className="speechsuper-panel"
      style={{ maxWidth: 1060, margin: '24px auto' }}
    >
      <h1 style={{ fontSize: 20 }}>评分详情验证</h1>
      <p>合成测试数据 · 复用教师端真实组件 · 未调用供应商</p>
      <label>
        测试样本
        <select value={i} onChange={(e) => setI(Number(e.target.value))}>
          {fixtures.map((f, i) => (
            <option value={i} key={i}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <ScoreSummary
        key={i}
        kind={f.kind}
        metrics={f.metrics}
        rawResult={f.raw}
      />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
