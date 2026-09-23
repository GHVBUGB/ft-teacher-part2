/// <reference types="vite/client" />
import { createRoot } from 'react-dom/client';
import { useState, useRef, useEffect } from 'react';
import { LanguageProvider } from '../src/shared/i18n';
import { stageItems } from '../src/features/practice/lib/stageCatalog';
import { CONTENT_VERSION } from '../src/features/practice/lib/catalog';
import { useStageTraining } from '../src/features/practice/useStageTraining';
import SpeechSuperPanel from '../src/features/practice/SpeechSuperPanel';
import type {
  SpeechKind,
  SpeechResult,
} from '../src/features/practice/lib/speechsuper';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
const context = {
  teacherId: 'SYNTHETIC-READING-FLOW-QA',
  enrollmentId: 'SYNTHETIC-READING-FLOW-QA',
  contentVersion: CONTENT_VERSION,
};
const key = `ft-practice:stages:v1:${context.teacherId}:${context.enrollmentId}:${context.contentVersion}:reading-flow-qa`;
function result(kind: SpeechKind, text: string, score = 80): SpeechResult {
  const metrics =
    kind === 'word'
      ? { pronunciation: score, stress: 90, intelligibility: 92 }
      : { pronunciation: score, fluency: score, rhythm: score, integrity: 100 };
  return {
    id: crypto.randomUUID(),
    kind,
    text,
    provider: 'synthetic',
    duration: 1,
    result: metrics,
    scale: '0-100',
    qualification: '合成测试，不代表真人评分',
  };
}
function Harness() {
  const stage = useStageTraining(context, stageItems, 'reading-flow-qa');
  const { start } = stage;
  useEffect(() => { start(); }, [start]);
  const words = stage.items.filter((item) => item.kind === 'word');
  const [calls, setCalls] = useState(0);
  const [micCalls, setMicCalls] = useState(0);
  const [mode, setMode] = useState('normal');
  const [sameBlob, setSameBlob] = useState(false);
  const previousBlob = useRef<Blob | null>(null);
  const [bytes, setBytes] = useState(0);
  const [score, setScore] = useState(31);
  function seedSeven() {
    for (const item of words.slice(0, 7))
      stage.record(item.id, result(item.kind, item.text));
  }
  function lowEighth() {
    stage.record(words[7].id, result('word', words[7].text, 79));
  }
  async function assess(kind: SpeechKind, text: string, audio: Blob) {
    if (!audio.size) throw new Error('empty test audio');
    setCalls((n) => n + 1);
    setBytes(audio.size);
    setSameBlob(previousBlob.current === audio);
    previousBlob.current = audio;
    if (mode === 'error') throw Error('模拟服务失败，录音已保留');
    if (mode === 'pending') return new Promise<SpeechResult>(() => {});
    return result(kind, text, score);
  }
  function enableMic() {
    navigator.mediaDevices.getUserMedia = async () => {
      setMicCalls((n) => n + 1);
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const destination = context.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.start();
      await context.resume();
      const track = destination.stream.getAudioTracks()[0];
      const stop = track.stop.bind(track);
      let stopped = false;
      track.stop = () => {
        if (stopped) return;
        stopped = true;
        stop();
        oscillator.stop();
        void context.close();
      };
      return destination.stream;
    };
  }
  async function loadAudio() {
    const response = await fetch('/samples/ft-word-box.wav');
    const input = document.querySelector<HTMLInputElement>('input[type=file]');
    if (!input) return;
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([await response.blob()], 'synthetic-example.wav', {
        type: 'audio/wav',
      }),
    );
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return (
    <main style={{ maxWidth: 1100, margin: 'auto', padding: '4px 12px 0' }}>
      <aside className="qa-controls" aria-label="合成测试控制台">
        <strong>合成成绩测试 · 独立测试账号 · 未调用评分供应商</strong>
        <div>
          <button onClick={enableMic}>启用合成麦克风</button>
          <select
            aria-label="模拟服务"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="normal">正常</option>
            <option value="error">失败</option>
            <option value="pending">无响应</option>
          </select>
          <button onClick={() => setScore(31)}>后续返回31分</button>
          <button onClick={() => setScore(85)}>后续返回85分</button>
          <button onClick={seedSeven}>前7题录入80分</button>
          <button onClick={()=>{for(const item of words.slice(0,-1))stage.record(item.id,result(item.kind,item.text));window.location.hash=`read/${words.at(-1)!.id}`;}}>准备单词关最后一题</button>
          <button onClick={()=>{const sentences=stage.items.filter(i=>i.kind==='sentence');for(const item of sentences.slice(0,-1))stage.record(item.id,result(item.kind,item.text));window.location.hash=`read/${sentences.at(-1)!.id}`;}}>准备句子关最后一题</button>
          <button onClick={lowEighth}>第8题录入79分</button>
          <button onClick={loadAudio}>装入合成测试音频</button>
          <button
            onClick={() => {
              localStorage.removeItem(key);
              window.location.hash = 'words';
              window.location.reload();
            }}
          >
            重置独立测试
          </button>
        </div>
        <output>
          已通过 {stage.status.word.passed}/{stage.status.word.total} · 开启录音 {micCalls} 次 ·
          评测提交 {calls} 次 · 音频 {bytes} 字节 · 与上次同一录音{' '}
          {String(sameBlob)}
        </output>
      </aside>
      <SpeechSuperPanel stage={stage} assess={assess} checkStatus={false} />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <LanguageProvider>
    <style>{`*{box-sizing:border-box}body{margin:0;background:#f6f9ff;color:#102a50;font-family:Nunito,"PingFang SC",sans-serif}button{font-family:inherit}.qa-controls{background:#fff1be;padding:8px 12px;border-radius:12px;margin-bottom:8px;font-size:13px}.qa-controls strong,.qa-controls output{display:block}.qa-controls div{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.qa-controls button{border:1px solid #d6c173;border-radius:6px;background:white;padding:6px 10px;cursor:pointer}`}</style>
    <Harness />
  </LanguageProvider>,
);
