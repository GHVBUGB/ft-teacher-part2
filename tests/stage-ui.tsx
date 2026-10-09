import { enableSyntheticMicrophone } from './synthetic-microphone';
import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import SpeechSuperPanel from '../src/features/practice/SpeechSuperPanel';
import { useStageTraining } from '../src/features/practice/useStageTraining';
import { LanguageProvider } from '../src/shared/i18n';
import type {
  StageContext,
  StageItem,
} from '../src/features/practice/lib/stageProgress';
import type {
  SpeechKind,
  SpeechResult,
} from '../src/features/practice/lib/speechsuper';

const context: StageContext = {
  teacherId: 'SYNTHETIC-STAGE-UI-TEACHER',
  enrollmentId: 'SYNTHETIC-STAGE-UI-ENROLLMENT',
  contentVersion: 'synthetic-20-words-v1',
};
const storageKey = `ft-practice:stages:v1:${context.teacherId}:${context.enrollmentId}:${context.contentVersion}:`;
const wordTexts = [
  'apple',
  'elephant',
  'yellow',
  'triangle',
  'red',
  'blue',
  'green',
  'orange',
  'purple',
  'pencil',
  'book',
  'teacher',
  'student',
  'classroom',
  'window',
  'table',
  'chair',
  'flower',
  'sun',
  'moon',
];
const items: readonly StageItem[] = [
  ...wordTexts.map((text, index) => ({
    id: `synthetic-word-${String(index + 1).padStart(2, '0')}`,
    text,
    kind: 'word' as const,
  })),
  {
    id: 'synthetic-sentence-01',
    text: 'This is a red apple.',
    kind: 'sentence',
  },
];
type ScoreChoice = '79.9' | '80' | 'missing';

function fixture(
  kind: SpeechKind,
  text: string,
  choice: ScoreChoice,
): SpeechResult {
  const targetScore = choice === '79.9' ? 79.9 : 80;
  const metrics: Record<string, unknown> =
    kind === 'word'
      ? {
          overall: 99,
          pronunciation: targetScore,
          intelligibility: 91,
          stress: 90,
        }
      : {
          overall: 99,
          pronunciation: targetScore,
          fluency: 80,
          rhythm: 80,
          integrity: 100,
          speed: 166,
        };
  if (choice === 'missing')
    delete metrics[kind === 'word' ? 'pronunciation' : 'rhythm'];
  const soundExamples: Record<string, string[]> = {
    apple: ['æ', 'p', 'əl'],
    moon: ['m', 'uː', 'n'],
    this: ['ð', 'ɪ', 's'],
    is: ['ɪ', 'z'],
    a: ['ə'],
    red: ['r', 'e', 'd'],
  };
  const wordResults = text
    .replace(/[.!?]/g, '')
    .split(/\s+/)
    .map((word, index) => ({
      word,
      text: word,
      pronunciation: index === 0 ? targetScore : 96,
      score: index === 0 ? targetScore : 96,
      quality_score: index === 0 ? targetScore : 96,
      stress: 90,
      feedback:
        choice === '79.9' && index === 0
          ? ['合成问题示例：起始音需要更清晰。']
          : [],
      phonemes: (soundExamples[word.toLowerCase()] ?? []).map(
        (phoneme, phoneIndex) => ({
          phoneme,
          pronunciation: phoneIndex === 0 ? targetScore : 95,
          feedback:
            choice === '79.9' && index === 0 && phoneIndex === 0
              ? ['合成问题示例：请重新练习本音素。']
              : [],
        }),
      ),
    }));
  return {
    id: `synthetic-assessment-${crypto.randomUUID()}`,
    provider: 'synthetic-ui-fixture',
    kind,
    text,
    duration: 1,
    scale: '0-100',
    qualification: '合成测试结果，不代表真实发音评估或教师资质',
    metrics,
    result: { ...metrics, words: wordResults, word_score_list: wordResults },
  };
}

function Harness({ reset }: { reset: () => void }) {
  const stage = useStageTraining(context, items);
  const [choice, setChoice] = useState<ScoreChoice>('79.9');
  const [notice, setNotice] = useState(
    '选择合成结果，启用合成麦克风，再使用组件内的开始录音和结束并评测。',
  );
  const [calls, setCalls] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  async function syntheticAssess(
    kind: SpeechKind,
    text: string,
    audio: Blob,
  ): Promise<SpeechResult> {
    if (!audio.size) throw new Error('测试音频为空。');
    setCalls((previous) => previous + 1);
    return fixture(kind, text, choice);
  }
  function seedFirst19() {
    for (const item of items
      .filter((item) => item.kind === 'word')
      .slice(0, 19))
      stage.record(item.id, fixture(item.kind, item.text, '80'));
    setNotice(
      '已向真实进度 Hook 写入前 19 词的合成 80 分。请在下方选择第 20 词 moon；第二关应仍锁定。',
    );
  }
  return (
    <>
      <section className="test-controls" aria-label="合成验收控制台">
        <div className="test-toolbar">
          <button onClick={reset}>重置独立测试进度</button>
          <button disabled={!stage.ready} onClick={seedFirst19}>
            给前 19 词各录入 80 分
          </button>
          <label>
            下一次模拟评分
            <select
              aria-label="下一次模拟评分"
              value={choice}
              onChange={(event) => setChoice(event.target.value as ScoreChoice)}
            >
              <option value="79.9">79.9 分 · 不通过</option>
              <option value="80">80 分 · 通过</option>
              <option value="missing">缺少必需维度 · 无法计算</option>
            </select>
          </label>
          <button onClick={() => enableSyntheticMicrophone()}>启用合成麦克风</button>
        </div>
        <output
          className="test-notice"
          style={{ display: 'block', margin: '14px 0' }}
        >
          {notice}
        </output>
        <div className="test-observed" aria-label="当前实际关卡状态">
          <div>
            <span>第一关 · 单词</span>
            <strong>
              {stage.status.word.passed} / {stage.status.word.total}
            </strong>
            <small>
              {stage.status.word.complete ? '全部逐题达标' : '尚未全部通过'}
            </small>
          </div>
          <div>
            <span>第二关 · 句子</span>
            <strong>
              {stage.status.sentence.unlocked ? '已解锁' : '锁定'}
            </strong>
            <small>
              {stage.status.sentence.passed} / {stage.status.sentence.total}{' '}
              通过
            </small>
          </div>
          <div>
            <span>第 20 词 · moon</span>
            <strong>
              {stage.status.items['synthetic-word-20']?.lastScore ?? '未练习'}
            </strong>
            <small>
              {stage.status.items['synthetic-word-20']?.passed
                ? '已通过'
                : '待达标'}
            </small>
          </div>
          <div>
            <span>记录与调用</span>
            <strong>{stage.progress.attempts.length} 条</strong>
            <small>本次合成评测 {calls} 次；真实供应商 0 次</small>
          </div>
        </div>
        <p className="test-caption">
          进度仅保存在独立测试账号与任务下，刷新页面应保留。有效判定来自真实
          Hook；任何分数、词级/音素详情均为合成数据。
        </p>
      </section>
      <div ref={panel}>
        <SpeechSuperPanel
          stage={stage}
          assess={syntheticAssess}
          checkStatus={false}
        />
      </div>
    </>
  );
}

function App() {
  const [revision, setRevision] = useState(0);
  function reset() {
    localStorage.removeItem(storageKey);
    setRevision((previous) => previous + 1);
  }
  return (
    <main className="stage-test-page">
      <style>{`
      *{box-sizing:border-box}body{margin:0;background:#f4f7fc;color:#172b42;font-family:Arial,"PingFang SC",sans-serif}.stage-test-page{max-width:1200px;margin:auto;padding:26px 24px 60px}.stage-test-page>h1{font-size:28px;margin:0 0 10px}.stage-test-page>p{line-height:1.6;margin-bottom:20px}.test-controls{background:white;border:1px solid #cfdef4;border-radius:16px;padding:20px}.test-toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:end}.test-toolbar button,.test-toolbar select{border:1px solid #b7c9e2;border-radius:8px;background:#f7faff;color:#174275;padding:10px 12px;font:inherit;cursor:pointer}.test-toolbar label{font-size:13px;display:flex;flex-direction:column;gap:5px}.test-toolbar button:disabled{opacity:.5;cursor:not-allowed}.test-notice{background:#fff7d5;padding:12px;border-radius:8px;line-height:1.6}.test-observed{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.test-observed>div{background:#eef5ff;padding:14px;border-radius:10px}.test-observed span,.test-observed small{display:block;font-size:13px}.test-observed strong{display:block;font-size:26px;color:#0063f2;margin:8px 0}.test-caption{font-size:13px;color:#526781;margin:14px 0 0}.test-observed small{line-height:1.5}@media(max-width:700px){.stage-test-page{padding:18px 12px}.test-observed{grid-template-columns:1fr 1fr}.test-toolbar>*{width:100%}}
    `}</style>
      <h1>逐题 80 分与关卡解锁验收</h1>
      <p>
        <strong>合成数据测试 · 不调用供应商 · 不用于教师认证。</strong>
        此页复用真实练习组件和进度 Hook，验证 20 个单词必须全部逐题达到 80
        分后，才能进入句子关卡。
      </p>
      <Harness key={revision} reset={reset} />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<LanguageProvider><App /></LanguageProvider>);
