'use client';
import AllStagesComplete from './AllStagesComplete';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MicrophoneIcon as Mic,
  SquareIcon as Square,
  SpeakerHighIcon as Volume2,
  ArrowRightIcon as ArrowRight,
  CheckIcon as Check,
  ArrowCounterClockwiseIcon as RotateCcw,
  HeadphonesIcon as Headphones,
  BookOpenIcon as BookOpen,
  FlaskIcon as FlaskConical,
  CaretRightIcon as ChevronRight,
  LockKeyIcon as LockKeyhole,
  CheckCircleIcon as CheckCircle2,
  WarningCircleIcon as AlertCircle,
  CalendarBlankIcon as CalendarDays,
  CloudSlashIcon as CloudOff,
  WaveformIcon as AudioLines,
  SpinnerGapIcon as LoaderCircle,
  XIcon,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress as ProgressBar } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { words, grammar, DEMO_THRESHOLD, CONTENT_VERSION } from './lib/catalog';
import {
  freshProgress,
  grammarResult,
  restartGrammar,
  parseProgress,
  completion,
  wordPassed,
  topicPassed,
  demoScore,
  STORAGE_KEY,
  type Progress,
  type Attempt,
  type GrammarAttempt,
} from './lib/progress';
import { sampleAudio, inspectAudio, type Clip } from './lib/audio';
import styles from './Practice.module.css';
import './GrammarFlow.css';
import { isOpenPreview } from './lib/previewMode';
import SpeechSuperPanel from './SpeechSuperPanel';
import { useStageTraining } from './useStageTraining';
import { stageItems } from './lib/stageCatalog';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon } from '@phosphor-icons/react';
import { useI18n } from '@/shared/i18n';
import { DEMO_ENROLLMENT_ID } from '@/shared/api/client';
import { useTraining } from '@/shared/auth/TrainingContext';
import { registerResourceRelease } from '@/shared/resources/audio';
const css = (names: string) =>
  names
    .split(/\s+/)
    .map((name) => styles[name] ?? name)
    .join(' ');
const uid = () => crypto.randomUUID();
export default function Practice() {
  // MediaRecorder and browser persistence are explicitly managed external state.
  'use no memo';
  const { t } = useI18n();
  const training = useTraining();
  const stage = useStageTraining({teacherId:training.teacher.id,enrollmentId:training.enrollment_id,contentVersion:CONTENT_VERSION},stageItems,new URLSearchParams(location.search).get('test') === 'acceptance' ? 'acceptance' : '');
  const storageKey =
    `${STORAGE_KEY}:${training.enrollment_id}` +
    (typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('test') === 'acceptance'
      ? ':acceptance'
      : '');
  const [p, setP] = useState<Progress>(freshProgress);
  const [ready, setReady] = useState(false);
  const debugTools = new URLSearchParams(location.search).get('debug') === '1';
  const openPreview = isOpenPreview();
  const [tab, setTab] = useState('speechsuper');
  const [allCompleteView, setAllCompleteView] = useState(location.hash === '#complete/all');
  useEffect(() => { stage.start(); }, [stage.start]);
  const [clip, setClip] = useState<Clip | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [speechBusy,setSpeechBusy] = useState(false);
  const [result, setResult] = useState<Attempt | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [scenario, setScenario] = useState('pass');
  const [selected, setSelected] = useState<string | null>(null);
  const [retryingAttempt, setRetryingAttempt] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [storageError, setStorageError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const streams = useRef<MediaStream | null>(null);
  const op = useRef(0);
  const busyRef = useRef(false);
  const player = useRef<HTMLAudioElement | null>(null);
  const playback = useRef<HTMLAudioElement | null>(null);
  const setPlaybackNode = useCallback((node: HTMLAudioElement | null) => {
    playback.current?.pause();
    playback.current = node;
  }, []);
  function pauseAudio(){player.current?.pause();playback.current?.pause();}
  const current = words[p.selectedWord];
  const wordItems = words
    .map((item, index) => ({ ...item, index }))
    .filter((item) => item.kind === '关键词');
  const sentenceItems = words
    .map((item, index) => ({ ...item, index }))
    .filter((item) => item.kind === '关键句');
  const sentenceMode = current.kind === '关键句';
  const practiceItems = sentenceMode ? sentenceItems : wordItems;
  const wordDone = wordItems.filter((item) => wordPassed(p, item.id)).length;
  const sentenceDone = sentenceItems.filter((item) =>
    wordPassed(p, item.id),
  ).length;
  const sectionDone = sentenceMode ? sentenceDone : wordDone;
  const grammarOrder = p.grammarOrder ?? grammar.map((_, i) => i);
  const grammarPosition = grammarOrder.indexOf(p.selectedTopic);
  const grammarOutcome = grammarResult(p);
  const topic = grammar[p.selectedTopic];
  const v =
    (((p.variants[topic.id] ?? 0) % topic.variants.length) +
      topic.variants.length) %
    topic.variants.length;
  const q = topic.variants[v];
  const latestAnswer = p.grammarAttempts.findLast((a) => a.topic === topic.id);
  const answer = latestAnswer?.variant === v && latestAnswer.id !== retryingAttempt ? latestAnswer : null;
  const choice = answer ? String(answer.selected) : selected;
  const c = completion(p);
  const bookingReady = debugTools ? c.ready : stage.status.pronunciationComplete && grammarOutcome.passed;
  const locked = busy || recording || speechBusy;
  const readingFlow = !debugTools;
  const itemAttempts = p.attempts.filter((a) => a.itemId === current.id);
  const passed = wordPassed(p, current.id);
  function update(fn: (prev: Progress) => Progress) {
    setP((prev) => ({ ...fn(prev), updatedAt: new Date().toISOString() }));
  }
  useEffect(() => {
    try {
      const testSuffix =
        new URLSearchParams(location.search).get('test') === 'acceptance'
          ? ':acceptance'
          : '';
      const saved =
        localStorage.getItem(storageKey) ??
        (training.teacher.external_teacher_id === 'DEMO-TEACHER-001' && training.enrollment_id === DEMO_ENROLLMENT_ID
          ? localStorage.getItem(STORAGE_KEY + testSuffix)
          : null);
      const parsed = parseProgress(saved);
      const legacyMatches = [training.teacher.id,'DEMO-TEACHER-001'].includes(parsed.teacherId) && [training.enrollment_id,'DEMO-FT-2026-001'].includes(parsed.enrollmentId);
      let restored: Progress = {
        ...(legacyMatches ? parsed : freshProgress()),
        teacherId: training.teacher.id,
        enrollmentId: training.enrollment_id,
      };
      if (grammarResult(restored).finished && !grammarResult(restored).passed) restored = restartGrammar(restored);
      const pending = (restored.grammarOrder ?? grammar.map((_, i) => i)).find(i => !restored.grammarAttempts.some(a => a.topic === grammar[i].id));
      if (pending !== undefined) restored.selectedTopic = pending;
      setP(restored);

    } catch {
      setStorageError(t('浏览器存储不可用，当前进度可能无法保留。'));
    }
    setReady(true);
    if (location.hash === '#my-page') setBooking(true);
    const handler = () => {
      if (location.hash === '#my-page') setBooking(true);
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, [storageKey, training.teacher.id, training.teacher.external_teacher_id, training.enrollment_id]);
  useEffect(() => {
    const sync = () => {
      const all = location.hash === '#complete/all';
      setAllCompleteView(all);
      setTab((location.hash === '#grammar' || all) && (openPreview || debugTools || stage.status.pronunciationComplete) ? 'grammar' : 'speechsuper');
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [openPreview, debugTools, stage.status.pronunciationComplete]);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem(storageKey, JSON.stringify(p));
        setStorageError('');
      } catch {
        setStorageError(t('本地保存失败，请导出记录后再继续。'));
      }
  }, [p, ready, storageKey]);
  useEffect(
    () =>
      registerResourceRelease(() => {
        op.current++;
        streams.current?.getTracks().forEach((t) => t.stop());
        pauseAudio();
      }),
    [],
  );
  useEffect(() => {
    if (!clip) return;
    return () => URL.revokeObjectURL(clip.url);
  }, [clip]);
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);
  useEffect(() => {
    if (recording && seconds >= 45) stopRecording();
  }, [seconds, recording]);
  function switchWord(i: number) {
    if (locked) return;
    pauseAudio();
    setTab(words[i].kind === '关键句' ? 'sentences' : 'pronunciation');
    op.current++;
    setClip(null);
    setResult(null);
    setError('');
    setNotice('');
    update((prev) => ({ ...prev, selectedWord: i }));
  }
  function switchModule(next: string) {
    if (locked || (next === 'grammar' && !debugTools && !openPreview && !stage.status.pronunciationComplete)) return;
    pauseAudio();
    if (next === 'pronunciation' || next === 'sentences') {
      const items = next === 'sentences' ? sentenceItems : wordItems;
      switchWord(
        items.some((item) => item.index === p.selectedWord)
          ? p.selectedWord
          : items[0].index,
      );
    } else {
      setTab(next);
      if (!debugTools) window.location.hash = next === 'grammar' ? 'grammar' : 'words';
      setError('');
    }
  }
  function continuePending() {
    const index = words.findIndex((item) => !wordPassed(p, item.id));
    if (index >= 0) switchWord(index);
    else switchModule('grammar');
  }
  function restartGrammarPreview() {
    setSelected(null);
    setRetryingAttempt(null);
    update(restartGrammar);
    window.location.hash = 'grammar';
  }
  function switchTopic(i: number) {
    if (!debugTools && (i !== grammarOrder[grammarPosition + 1] || !answer || grammarOutcome.finished)) return;
    setSelected(null);
    setRetryingAttempt(null);
    update((prev) => ({ ...prev, selectedTopic: i }));
  }
  async function listen() {
    setNotice('');
    pauseAudio();
    const audio = new Audio(`/samples/${current.id}.wav`);
    player.current = audio;
    try {
      await audio.play();
      setNotice(t('正在播放合成示范音频。'));
      audio.onended = () => setNotice(t('示范播放结束，可以开始朗读。'));
    } catch {
      setNotice(t('示范播放失败，请重试。'));
    }
  }
  async function startRecording() {
    if (busyRef.current || recording) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    setClip(null);
    setResult(null);
    pauseAudio();
    const token = ++op.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error(
          t(
            '当前浏览器不支持录音。请使用支持麦克风的浏览器，或载入示例音频测试。',
          ),
        );
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (token !== op.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streams.current = stream;
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(
        (t) => MediaRecorder.isTypeSupported(t),
      );
      const rec = new MediaRecorder(
        stream,
        type ? { mimeType: type } : undefined,
      );
      recorder.current = rec;
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onerror = () => {
        setError(t('录音中断，请重新录制。'));
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        if (token !== op.current) return;
        setBusy(true);
        busyRef.current = true;
        try {
          const blob = new Blob(chunks, { type: rec.mimeType });
          const meta = await inspectAudio(blob);
          if (token === op.current) {
            setClip({
              blob,
              url: URL.createObjectURL(blob),
              ...meta,
              source: 'microphone',
            });
            setNotice(t('录音已生成。评测仍使用模拟结果，不验证真实发音。'));
          }
        } catch {
          setError(t('录音无法读取，请重新录制。'));
        } finally {
          setBusy(false);
          busyRef.current = false;
        }
      };
      rec.start();
      setSeconds(0);
      setRecording(true);
    } catch (e) {
      streams.current?.getTracks().forEach((t) => t.stop());
      setError(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? t(
              '麦克风权限未开启。请在浏览器中允许麦克风后重试；也可载入示例音频测试。',
            )
          : e instanceof Error
            ? e.message
            : t('无法打开麦克风，请重试。'),
      );
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  function stopRecording() {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }
  async function loadSample(silent = false) {
    if (locked || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setResult(null);
    setClip(null);
    const token = ++op.current;
    try {
      const a = await sampleAudio(current.id, silent);
      if (token === op.current) {
        setClip(a);
        setNotice(
          silent
            ? t('已载入 2 秒静音测试音频。')
            : t('已载入合成示例音频，可回放并测试评测流程。'),
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  async function assess() {
    if (busyRef.current || recording) return;
    if (!clip) {
      setError(t('请先录音或载入示例音频，再提交评测。'));
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    const token = ++op.current;
    const id = current.id;
    const captured = clip;
    const chosen = scenario;
    await new Promise((r) => setTimeout(r, 600));
    if (token !== op.current) {
      busyRef.current = false;
      setBusy(false);
      return;
    }
    const a: Attempt = {
      id: uid(),
      itemId: id,
      at: new Date().toISOString(),
      source: captured.source,
      scenario: chosen,
      ...demoScore(chosen, captured.duration, captured.rms),
      duration: captured.duration,
      human: 'not_reviewed',
    };
    update((prev) => ({ ...prev, attempts: [...prev.attempts, a] }));
    setResult(a);
    setBusy(false);
    busyRef.current = false;
  }
  function grade() {
    if (selected === null || answer || grammarOutcome.finished) return;
    const a: GrammarAttempt = {
      id: uid(),
      topic: topic.id,
      variant: v,
      selected: Number(selected),
      correct: Number(selected) === q.answer,
      at: new Date().toISOString(),
    };
    update((prev) => ({
      ...prev,
      grammarAttempts: [...prev.grammarAttempts, a],
    }));
  }
  function retryGrammar() {
    setRetryingAttempt(latestAnswer?.id ?? null);
    setSelected(null);
    update((prev) => ({
      ...prev,
      variants: {
        ...prev.variants,
        [topic.id]: (v + 1) % topic.variants.length,
      },
    }));
  }
  function openBooking() {
    setBooking(true);
    history.replaceState(null, '', '#my-page');
  }
  return (
    <div className={css('studio')} id="top" data-reading-flow={readingFlow || undefined}>
      <main className={css('shell')}>
        <Link className={css('intro-back')} to={`/training/${training.enrollment_id}/practice${location.search}`}>
          <ArrowLeftIcon size={18} aria-hidden="true" />{t('返回关卡介绍')}
        </Link>
        {!readingFlow && <div className={css('heading')}>
          <div>
            <p className={css('eyebrow')}>{t('练习 / 改进 / 教学')}</p>
            <h1>
              {t(['speechace', 'speechsuper'].includes(tab) ? '词句发音练习' : tab === 'grammar' ? '语法测验' : sentenceMode ? '关键句朗读' : '单词发音')}
              <span className={css('title-dot')}>.</span>
            </h1>
            <p className={css('subtitle')}>
              {t('练习课堂关键词，掌握准确的表达。')}
            </p>
          </div>
          <div className={css('save-note')}>
            <CloudOff size={16} />
            {tab === 'speechace' ? '对照测试不计入关卡' : ready && stage.ready ? t('进度保存在此浏览器') : t('正在恢复进度')}
          </div>
        </div>}
        {!readingFlow && <div className={css('demo-banner')}>
          <FlaskConical size={19} />
          <span>
            <strong>{['speechace', 'speechsuper'].includes(tab) ? '接入试点' : t('演示环境')}</strong>
            {debugTools ? t('词句来自业务 FT 清单；本页演示评分为模拟，语法暂为示例题。') : t('词句来自业务 FT 清单。发音逐题至少 80 分，本关全部通过后解锁下一关；语法暂为示例题。')}
          </span>
          {debugTools && <a
            href="#demo-controls"
            onClick={() => {
              switchModule(sentenceMode ? 'sentences' : 'pronunciation');
              requestAnimationFrame(() => {
                const tools = document.getElementById('demo-controls');
                if (tools instanceof HTMLDetailsElement) tools.open = true;
                tools?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              });
            }}
          >
            {t('测试设置')}
            <ChevronRight size={15} />
          </a>}
        </div>}
        {storageError && (
          <p role="alert" className={css('error')}>
            {t(storageError)}
          </p>
        )}
        <Tabs
          value={tab}
          onValueChange={(x) => switchModule(String(x))}
          className={css('practice-tabs')}
        >
          {debugTools && <div className={css('tabbar')}>
            <TabsList
              variant="line"
              className={css('tabs-list')}
              aria-label={t('练习模块')}
            >
              {debugTools && <TabsTrigger value="speechace" disabled={locked}>Speechace 对照测试</TabsTrigger>}
              <TabsTrigger value="speechsuper" disabled={locked}>{t('第一、二关 · 发音')}</TabsTrigger>
              {debugTools && <TabsTrigger value="pronunciation" disabled={locked}>
                <Headphones />
                {t('单词发音')}
                <span className={css('tab-count')}>
                  {wordDone}/{wordItems.length}
                </span>
              </TabsTrigger>}
              {debugTools && <TabsTrigger value="sentences" disabled={locked}>
                <AudioLines />
                {t('关键句朗读')}
                <span className={css('tab-count')}>
                  {sentenceDone}/{sentenceItems.length}
                </span>
              </TabsTrigger>}
              <TabsTrigger value="grammar" disabled={locked || (!debugTools && !stage.status.pronunciationComplete)} title={!stage.status.pronunciationComplete && !debugTools ? t('单词和句子全部通过后解锁语法关') : undefined}>
                <BookOpen />
                {t('第三关 · 语法')}
                {!debugTools && !stage.status.pronunciationComplete ? <LockKeyhole size={16} aria-label={t('尚未解锁')} /> : <span className={css('tab-count')}>{c.grammar}/{grammar.length}</span>}
              </TabsTrigger>

            </TabsList>
            <span className={css('local-badge')}>
              <span />
              {t('自动保存')}
            </span>
          </div>}
          <TabsContent value="speechace"><SpeechSuperPanel key="speechace" provider="speechace" onBusyChange={setSpeechBusy} /></TabsContent>
          <TabsContent value="speechsuper"><SpeechSuperPanel key={`speechsuper:${training.teacher.id}:${training.enrollment_id}`} provider="speechsuper" stage={stage} onBusyChange={setSpeechBusy} />
          </TabsContent>
          <TabsContent
            value={tab === 'sentences' ? 'sentences' : 'pronunciation'}
          >
            <div className={css('workspace')}>
              <section className={css('practice-card')}>
                <div className={css('card-top')}>
                  <span className={css('pill')}>
                    {sentenceMode ? t('关键句朗读') : t('单词发音')}
                  </span>
                  <span>
                    {t('练习')}
                    {String(
                      practiceItems.findIndex(
                        (item) => item.index === p.selectedWord,
                      ) + 1,
                    ).padStart(2, '0')}{' '}
                    / {String(practiceItems.length).padStart(2, '0')}
                  </span>
                </div>
                <div className={css('word-stage')}>
                  <p className={css('stage-label')}>{t('先听示范，再开口朗读。')}</p>
                  <h2
                    className={css(current.kind === '关键句' ? 'sentence' : '')}
                  >
                    {current.text}
                  </h2>
                  <p className={css('ipa')}>{current.ipa}</p>
                  <p className={css('translation')}>
                    {sentenceMode
                      ? t('课堂表达')
                      : t('课堂词汇')}
                  </p>

                  <p className={css('example')}>{t(current.example)}</p>
                </div>
                <div className={css('coach-tip')}>
                  <span className={css('tip-icon')}>
                    <AudioLines size={19} />
                  </span>
                  <div>
                    <strong>{t('朗读提示')}</strong>
                    <p>{t(current.hint)}</p>
                  </div>
                </div>
                <div className={css('record-area')}>
                  <div
                    className={css(
                      'sound-bars ' + (recording ? 'recording' : ''),
                    )}
                    aria-hidden="true"
                  >
                    {Array.from({ length: 29 }, (_, i) => (
                      <i
                        key={i}
                        style={{
                          height: recording
                            ? `${10 + ((i * 19) % 34)}px`
                            : '5px',
                          animationDelay: `${i * 0.043}s`,
                        }}
                      />
                    ))}
                  </div>
                  <p>
                    {recording
                      ? `${t('录音中')} · ${String(seconds).padStart(2, '0')}${t('秒')} / ${t('最长 45 秒')}`
                      : clip
                        ? `${clip.source === 'sample' ? t('合成示例音频') : t('麦克风录音')} · ${clip.duration.toFixed(1)}${t('秒')}`
                        : t('点击录音，清晰朗读上方词句')}
                  </p>
                  {clip && (
                    // User recording has no verified transcript; do not fabricate captions.
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <audio
                      ref={setPlaybackNode}
                      className={css('playback')}
                      controls
                      src={clip.url}
                      aria-label={t('回放本次录音')}
                    />
                  )}
                  <div className={css('record-actions')}>
                    <Button
                      className={css(
                        'primary-btn ' + (recording ? 'stop-btn' : ''),
                      )}
                      disabled={busy}
                      onClick={recording ? stopRecording : startRecording}
                    >
                      {recording ? <Square /> : <Mic />}
                      {recording
                        ? t('停止录音')
                        : clip
                          ? t('重新录音')
                          : t('开始录音')}
                    </Button>
                  <Button
                    variant="outline"
                    className={css('listen-btn')}
                    onClick={listen}
                    disabled={recording}
                  >
                    <Volume2 />
                    {t('听示范')}
                  </Button>
                    <Button
                      className={css('action-btn')}
                      variant="outline"
                      disabled={locked}
                      onClick={assess}
                    >
                      {busy ? (
                        <LoaderCircle className={css('spin')} />
                      ) : (
                        <ArrowRight />
                      )}
                      {t('提交模拟评测')}
                    </Button>
                  </div>
                  <div aria-live="polite" className={css('notice')}>
                    {t(notice)}
                  </div>
                  {error && (
                    <p role="alert" className={css('error')}>
                      <AlertCircle size={16} />
                      {t(error)}
                    </p>
                  )}
                </div>
                {result && (
                  <div
                    className={css(
                      'score-result ' +
                        (result.passed
                          ? 'success'
                          : result.status === 'scored'
                            ? 'retry'
                            : 'invalid'),
                    )}
                    aria-live="polite"
                  >
                    <div className={css('result-line')}>
                      <div>
                        <p className={css('eyebrow')}>
                          {t('模拟评测结果 · 第')}
                          {itemAttempts.length}
                          {t('次')}
                        </p>
                        <h3>
                          {result.status === 'invalid'
                            ? t('未检测到有效朗读')
                            : result.status === 'error'
                              ? t('评测服务暂不可用')
                              : result.passed
                                ? t('本次演示达标')
                                : t('继续练习，再试一次')}
                        </h3>
                      </div>
                      <div className={css('score')}>
                        {result.score ?? '—'}
                        <small>/ 100</small>
                      </div>
                    </div>
                    <p>
                      {result.status === 'invalid'
                        ? t('音频过短或接近静音，本次不计为达标。请重新录音。')
                        : result.status === 'error'
                          ? t('未获得评分，本次不计为达标。可重新提交。')
                          : result.passed
                            ? t(
                                '模拟反馈：音节和节奏达到演示门槛。请继续下一项练习。',
                              )
                            : t(
                                '模拟反馈：请留意重读音节，听示范后重新朗读。重试次数不限。',
                              )}
                    </p>
                    <div className={css('score-foot')}>
                      <span>
                        {t('分数来自所选测试场景，与录音的真实发音无关。')}
                      </span>
                      <strong>{t('人工校验：未进行')}</strong>
                    </div>
                    {result.status === 'scored' && (
                      <Button
                        className={css('action-btn')}
                        variant={result.passed ? 'default' : 'outline'}
                        onClick={() =>
                          result.passed
                            ? p.selectedWord < words.length - 1
                              ? switchWord(p.selectedWord + 1)
                              : switchModule('grammar')
                            : (setResult(null),
                              setClip(null),
                              setNotice(t('可以重新录音或载入示例音频。')))
                        }
                      >
                        {result.passed ? t('继续下一项') : t('重新练习')}
                        <ArrowRight />
                      </Button>
                    )}
                  </div>
                )}
                <details id="demo-controls" className={css('demo-controls')}>
                  <summary className={css('test-head')}>
                    <FlaskConical size={16} />
                    <strong>{t('模拟测试工具')}</strong>
                    <span>{t('仅用于验收流程')}</span>
                  </summary>
                  <div className={css('test-row')}>
                    <label htmlFor="scenario">{t('评测场景')}</label>
                    <Select
                      value={scenario}
                      onValueChange={(x) => {
                        setScenario(String(x));
                        setResult(null);
                      }}
                      disabled={locked}
                    >
                      <SelectTrigger id="scenario" aria-label={t('评测场景')}>
                        <SelectValue>
                          {scenario === 'pass'
                            ? t('演示达标 · 92 分')
                            : scenario === 'retry'
                              ? t('需要重练 · 62 分')
                              : t('评测服务异常')}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pass">
                          {t('演示达标 · 92 分')}
                        </SelectItem>
                        <SelectItem value="retry">
                          {t('需要重练 · 62 分')}
                        </SelectItem>
                        <SelectItem value="error">
                          {t('评测服务异常')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      className={css('small-btn')}
                      disabled={locked}
                      onClick={() => loadSample()}
                    >
                      {t('载入示例录音')}
                    </Button>
                    <Button
                      variant="ghost"
                      className={css('small-btn')}
                      disabled={locked}
                      onClick={() => loadSample(true)}
                    >
                      {t('载入静音')}
                    </Button>
                  </div>
                  <p>
                    {t(
                      '录音只在当前页面暂存，刷新后清除；评分记录保留。演示分数不用于正式资格判断。',
                    )}
                  </p>
                </details>
              </section>
              <aside className={css('right-column')}>
                <section className={css('list-panel')}>
                  <div className={css('panel-heading')}>
                    <h3>
                      {sentenceMode ? t('关键句朗读清单') : t('单词发音清单')}
                    </h3>
                    <span>
                      {practiceItems.length}
                      {t('项')}
                    </span>
                  </div>
                  {practiceItems.map((w, localIndex) => (
                    <button
                      key={w.id}
                      className={css(
                        'word-row ' +
                          (w.index === p.selectedWord ? 'active' : ''),
                      )}
                      onClick={() => switchWord(w.index)}
                      disabled={locked}
                      aria-current={
                        w.index === p.selectedWord ? 'step' : undefined
                      }
                    >
                      <span
                        className={css(
                          'row-number ' + (wordPassed(p, w.id) ? 'done' : ''),
                        )}
                      >
                        {wordPassed(p, w.id) ? (
                          <Check size={15} />
                        ) : (
                          String(localIndex + 1).padStart(2, '0')
                        )}
                      </span>
                      <span>
                        <strong>{w.text}</strong>
                        <small>
                          {t(w.kind)} ·{' '}
                          {wordPassed(p, w.id) ? t('演示达标') : t('待练习')}
                        </small>
                      </span>
                      <ChevronRight size={15} />
                    </button>
                  ))}
                </section>
                <section className={css('progress-panel')}>
                  <div className={css('panel-heading')}>
                    <h3>
                      {sentenceMode ? t('关键句朗读进度') : t('单词发音进度')}
                    </h3>
                    <span>
                      {sectionDone} / {practiceItems.length}
                    </span>
                  </div>
                  <ProgressBar
                    value={(sectionDone / practiceItems.length) * 100}
                    aria-label={
                      sentenceMode ? t('关键句朗读进度') : t('单词发音进度')
                    }
                  />
                  <p>
                    {t('本组')}
                    {practiceItems.length}
                    {t('项达到演示门槛（')}
                    {DEMO_THRESHOLD} {t('分）后完成。已达标项目可继续练习。')}
                  </p>
                </section>
                <div className={css('history-mini')}>
                  <RotateCcw size={17} />
                  <span>
                    {t('本项已尝试')}
                    <strong>{itemAttempts.length}</strong>
                    {t('次')}
                    {passed ? t(' · 历史演示已达标') : ''}
                    <small>{t('重试不重复累计完成数量')}</small>
                  </span>
                </div>
              </aside>
            </div>
          </TabsContent>
          <TabsContent value="grammar">
            {!debugTools && allCompleteView && (bookingReady || openPreview) ? <AllStagesComplete onRetryGrammar={openPreview ? restartGrammarPreview : undefined} completed={bookingReady} preview={openPreview && !bookingReady} onBack={() => { window.location.href = `/training/${training.enrollment_id}/practice${location.search}`; }} /> : !debugTools ? <section className="grammar-flow ss-reader" aria-label={t('语法测验')}>
              <nav className="grammar-nav"><Link to={{pathname:`/training/${training.enrollment_id}/practice`,search:location.search}}><ArrowLeftIcon/>{t('返回关卡介绍')}</Link><span>{String(grammarPosition+1).padStart(2,'0')} / {String(grammar.length).padStart(2,'0')}</span><strong>{t('语法测验')}</strong></nav>
              <div className="grammar-topic-tabs">{grammarOrder.map((index,i)=>{const g=grammar[index];const attempt=p.grammarAttempts.find(a=>a.topic===g.id);return <span className="grammar-step" key={g.id} aria-label={`Question ${i+1}`} data-passed={attempt?.correct||undefined} data-wrong={attempt && !attempt.correct || undefined} aria-current={i===grammarPosition?'step':undefined}>{String(i+1).padStart(2,'0')}</span>})}</div>
              <div className="grammar-question"><small>{t('FT Questions · 30道语法题')}</small><p>{t(q.context)}</p><h1>{q.prompt}</h1></div>
              <fieldset className="grammar-options" aria-label={t('语法选项')}>{q.options.map((option,i)=><button key={`${topic.id}-${v}-${i}`} disabled={!!answer} onClick={()=>setSelected(String(i))} aria-pressed={choice===String(i)} data-correct={answer?.correct&&i===q.answer||undefined} data-wrong={answer&&!answer.correct&&choice===String(i)||undefined}><span>{String.fromCharCode(65+i)}</span>{option}{answer?.correct&&i===q.answer&&<CheckCircle2/>}</button>)}</fieldset>
              <div className="grammar-response" aria-live="polite">{answer&&<><strong data-correct={answer.correct}>{answer.correct?<CheckCircle2/>:<AlertCircle/>}{t(answer.correct?'回答正确':'回答错误')}</strong>{answer.correct && <p>{t(q.explanation)}</p>}</>}</div>
              {grammarOutcome.finished && <p className="grammar-result" role="status">{t(grammarOutcome.passed ? '本轮通过' : '本轮未通过')} · {grammarOutcome.failedEarly ? t('已答错7题，无法达到80%，请重新考核。') : <>{grammarOutcome.correct} / {grammar.length} · {Math.round(grammarOutcome.correct / grammar.length * 100)}%</>}<br/>{t('答对至少24题（80%）通过；未通过重新进入将打乱题序。')}</p>}
              <div className="grammar-actions">{!answer ? <button disabled={selected===null} onClick={grade}>{t('提交答案')}<ArrowRight/></button> : !grammarOutcome.finished ? <button onClick={()=>switchTopic(grammarOrder[grammarPosition+1])}>{t('下一题')}<ArrowRight/></button> : grammarOutcome.passed ? <button onClick={()=>{window.location.hash='complete/all';}}>{t('查看通关')}<ArrowRight/></button> : <button onClick={restartGrammarPreview}>{t('打乱题目重新考核')}<RotateCcw/></button>}</div>
            </section> : <>

            {bookingReady && <Button className={css('primary-btn')} onClick={openBooking}>
              <CheckCircle2 aria-hidden="true" />{t('查看 My Page 预约提示')}<ArrowRight aria-hidden="true" />
            </Button>}
            <div className={css('workspace')}>
              <section className={css('practice-card grammar-card')}>
                <div className={css('card-top')}>
                  <span className={css('pill purple')}>{t(topic.name)}</span>
                  <span>
                    {t('知识点')}
                    {p.selectedTopic + 1}
                    / {grammar.length} · {t('题目')}
                    {v + 1}
                  </span>
                </div>
                <div className={css('question')}>
                  <p className={css('stage-label')}>
                    {t('选择正确的表达。')}
                  </p>
                  <p className={css('context')}>{t(q.context)}</p>
                  <h2>{q.prompt}</h2>
                  <RadioGroup
                    aria-label={t('语法选项')}
                    value={choice}
                    onValueChange={(x) => setSelected(String(x))}
                    disabled={!!answer}
                  >
                    {q.options.map((a, i) => (
                      <label
                        className={css(
                          'answer-option ' +
                            (choice === String(i) ? 'chosen' : '') +
                            (answer && i === q.answer ? ' correct' : ''),
                        )}
                        key={`${topic.id}-${v}-${i}`}
                      >
                        <RadioGroupItem value={String(i)} aria-label={a} />
                        <span className={css('letter')}>
                          {String.fromCharCode(65 + i)}
                        </span>
                        <span>{a}</span>
                        {answer && i === q.answer && <CheckCircle2 size={20} />}
                      </label>
                    ))}
                  </RadioGroup>
                  <Button
                    className={css('primary-btn')}
                    disabled={selected === null || !!answer}
                    onClick={grade}
                  >
                    {t('提交答案')}
                    <ArrowRight />
                  </Button>
                </div>
                {answer && (
                  <div
                    className={css(
                      'grammar-feedback ' +
                        (answer.correct ? 'success' : 'retry'),
                    )}
                    aria-live="polite"
                  >
                    <div className={css('feedback-title')}>
                      {answer.correct ? <CheckCircle2 /> : <AlertCircle />}
                      <h3>
                        {answer.correct
                          ? t('回答正确，掌握这个知识点')
                          : t('再想一想，看看原因')}
                      </h3>
                    </div>
                    <p>
                      <strong>{t('正确答案：')}</strong>
                      {q.options[q.answer]}
                    </p>
                    <p>{t(q.explanation)}</p>
                    <div className={css('feedback-buttons')}>
                      <Button
                        className={css('action-btn')}
                        variant="outline"
                        onClick={retryGrammar}
                      >
                        <RotateCcw />
                        {t('再练一道变式')}
                      </Button>
                      {answer.correct && (
                        <Button
                          className={css('action-btn')}
                          onClick={() => {
                            const nextTopic = grammar.findIndex((item) => !topicPassed(p, item.id));
                            if (nextTopic >= 0) switchTopic(nextTopic);
                            else openBooking();
                          }}
                        >
                          {t('继续下一项')}
                          <ArrowRight />
                        </Button>
                      )}
                    </div>
                  </div>
                )}
                <div className={css('grammar-foot')}>
                  <BookOpen size={18} />
                  <p>
                    {t(
                      '每个知识点答对至少一题即演示通过。答错后，换一道同知识点题目再练；不限次数。',
                    )}
                  </p>
                </div>
              </section>
              <aside className={css('right-column')}>
                <section className={css('list-panel')}>
                  <div className={css('panel-heading')}>
                    <h3>{t('语法知识点')}</h3>
                    <span>{t('3 项')}</span>
                  </div>
                  {grammar.map((g, i) => (
                    <button
                      className={css(
                        'word-row ' + (i === p.selectedTopic ? 'active' : ''),
                      )}
                      onClick={() => switchTopic(i)}
                      key={g.id}
                    >
                      <span
                        className={css(
                          'row-number ' + (topicPassed(p, g.id) ? 'done' : ''),
                        )}
                      >
                        {topicPassed(p, g.id) ? <Check size={15} /> : i + 1}
                      </span>
                      <span>
                        <strong>{t(g.name)}</strong>
                        <small>
                          {topicPassed(p, g.id) ? t('演示通过') : t(g.description)}
                        </small>
                      </span>
                      <ChevronRight size={15} />
                    </button>
                  ))}
                </section>
                <section className={css('progress-panel')}>
                  <div className={css('panel-heading')}>
                    <h3>{t('语法进度')}</h3>
                    <span>{c.grammar} / {grammar.length}</span>
                  </div>
                  <ProgressBar
                    value={(c.grammar / grammar.length) * 100}
                    aria-label={t('语法演示进度')}
                  />
                  <p>
                    {t(
                      '同一知识点反复练习，只计一次完成。题目与解析为演示内容，待业务审核。',
                    )}
                  </p>
                </section>
              </aside>
            </div>
            </> }
          </TabsContent>
        </Tabs>
        <footer>
          <span>
            51Talk <b>／</b>
            {t('第二部分 · 发音与语法')}
          </span>
          <span>{debugTools ? t('模拟数据独立保存 · 不代表正式上岗资格') : '本地练习记录 · 不代表正式上岗资格'}</span>
        </footer>
      </main>
      <Dialog
        open={booking}
        onOpenChange={(x) => {
          setBooking(x);
          if (!x)
            history.replaceState(null, '', location.pathname + location.search);
        }}
      >
        <DialogContent className={css('booking-dialog')} showCloseButton={false}>
          <DialogClose render={<Button variant="ghost" size="icon-sm" className={css('dialog-close')} />} aria-label={t('关闭')}>
            <XIcon aria-hidden="true" />
          </DialogClose>
          <DialogHeader>
            <span className={css('dialog-icon')}>
              {bookingReady ? <CalendarDays /> : <LockKeyhole />}
            </span>
            <DialogTitle>
              {bookingReady
                ? t('My Page · 真人培训预约提示')
                : t('还需要完成这些练习')}
            </DialogTitle>
            <DialogDescription>
              {bookingReady
                ? t('这是预约入口演示，尚未连接正式 My Page。')
                : t('当前演示前置条件尚未满足，无法进入下一步。')}
            </DialogDescription>
          </DialogHeader>
          <div className={css('booking-checks')}>
            <p>
              <CheckCircle2 />
              {t('发音练习')}
              <strong>{debugTools ? c.pronunciation : stage.status.word.passed + stage.status.sentence.passed}/{stageItems.length}</strong>
            </p>
            <p>
              <CheckCircle2 />
              {t('语法知识点')}
              <strong>{c.grammar}/{grammar.length}</strong>
            </p>
          </div>
          {bookingReady ? (
            <>
              <p>
                {t(
                  '正式流程：在 My Page 选择 Book My Training，预约 FT Signature Flow 真人培训。',
                )}
              </p>
              <div className={css('booking-warning')}>
                <AlertCircle />
                <span>
                  {t(
                    '正式链接待业务提供。没有发送通知，也没有产生真实预约。真实发音和第一部分状态仍需正式校验。',
                  )}
                </span>
              </div>
              <Button
                className={css('action-btn')}
                onClick={() => {
                  setBooking(false);
                  history.replaceState(
                    null,
                    '',
                    location.pathname + location.search,
                  );
                }}
              >
                {t('了解，返回练习')}
              </Button>
            </>
          ) : (
            <Button
              className={css('primary-btn')}
              onClick={() => {
                setBooking(false);
                if(debugTools) continuePending(); else switchModule(stage.status.pronunciationComplete ? 'grammar' : 'speechsuper');
                history.replaceState(
                  null,
                  '',
                  location.pathname + location.search,
                );
              }}
            >
              {t('继续练习')}
              <ArrowRight />
            </Button>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
