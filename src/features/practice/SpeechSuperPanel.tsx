import { isOpenPreview } from './lib/previewMode';
import StageCompletion from './StageCompletion';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { assessSpeech, type SpeechResult } from './lib/speechsuper';
import { abortable, ASSESSMENT_TIMEOUT_MS } from './lib/assessmentRequest';
import { calculateScore } from './lib/score';
import type { StageTraining } from './useStageTraining';
import ScoreSummary from './ScoreSummary';
import ReadingMap from './ReadingMap';
import { useI18n } from '../../shared/i18n';
import './SpeechSuperPanel.css';
import './ReadingFlow.css';
import {
  MicrophoneIcon,
  WaveformIcon,
  SquareIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CircleNotchIcon,
  WarningCircleIcon,
  CheckCircleIcon,
} from '@phosphor-icons/react';
const defaults = { word: 'apple', sentence: 'This is a red apple.' };
const navigationSnapshot = () => window.location.hash;
function subscribeNavigation(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}
export default function SpeechSuperPanel({
  provider = 'speechsuper',
  stage,
  assess = assessSpeech,
  checkStatus = true,
  onBusyChange,
}: {
  provider?: 'speechace' | 'speechsuper';
  stage?: StageTraining;
  assess?: typeof assessSpeech;
  checkStatus?: boolean;
  onBusyChange?: (value: boolean) => void;
}) {
  // MediaRecorder and object URLs are explicitly managed browser resources.
  'use no memo';
  const { t } = useI18n();
  const navigation = useSyncExternalStore(
    subscribeNavigation,
    navigationSnapshot,
    () => '',
  );
  const vendor = provider === 'speechace' ? 'Speechace' : 'SpeechSuper';
  const [freeKind, setFreeKind] = useState<'word' | 'sentence'>('word');
  const [freeText, setFreeText] = useState(defaults.word);
  const selectedId = navigation.startsWith('#read/') ? navigation.slice(6) : '';
  const requested = stage?.items.find((i) => i.id === selectedId);
  const reading = Boolean(
    requested && (requested.kind === 'word' || stage?.status.sentence.unlocked),
  );
  const mapKind =
    navigation === '#sentences' && stage?.status.sentence.unlocked
      ? 'sentence'
      : 'word';
  const item =
    (reading ? requested : undefined) ??
    stage?.items.find((i) => i.kind === 'word');
  const kind = item?.kind ?? freeKind;
  const text = item?.text ?? freeText;
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [_status, setStatus] = useState(
    checkStatus ? '正在检查评测服务…' : '合成数据验证 · 未调用供应商',
  );
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState('');
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SpeechResult | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const alive = useRef(true);
  const operation = useRef(0);
  const busyRef = useRef(false);
  const assessmentController = useRef<AbortController | null>(null);
  const playback = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const leaveReading = () => {
      operation.current++;
      assessmentController.current?.abort();
      setProcessing('');
      clearTimeout(timer.current);
      if (rec.current?.state === 'recording') rec.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
      playback.current?.pause();
      busyRef.current = false;
      setBusy(false);
      setRecording(false);
      setBlob(null);
      setResult(null);
      setError('');
      setName('');
      setStatus((previous) =>
        previous === '本次评测已完成' ? '评测服务已就绪' : previous,
      );
      window.scrollTo({ top: 0, behavior: 'instant' });
    };
    window.addEventListener('hashchange', leaveReading);
    return () => window.removeEventListener('hashchange', leaveReading);
  }, []);
  const setPlaybackNode = useCallback((node: HTMLAudioElement | null) => {
    playback.current?.pause();
    playback.current = node;
  }, []);
  const releaseRecording = useCallback(() => {
    // Read the latest recorder/stream created after mount, not a mount-time snapshot.
    alive.current = false;
    operation.current++;
    assessmentController.current?.abort();
    clearTimeout(timer.current);
    if (rec.current?.state === 'recording') rec.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
  }, []);
  useEffect(() => {
    alive.current = true;
    return releaseRecording;
  }, [releaseRecording]);
  useEffect(() => {
    if (!blob) {
      // eslint-disable-next-line react/react-compiler -- Synchronize state with a revoked browser object URL; URL creation/revocation must stay outside render.
      setUrl('');
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  const check = useCallback(async () => {
    if (!checkStatus) return;
    setStatus('正在检查评测服务…');
    try {
      const r = await fetch(`/api/${provider}/status`, {
        signal: AbortSignal.timeout(5000),
      });
      const d = await r.json();
      if (!r.ok || d.provider !== provider) throw new Error();
      if (alive.current)
        setStatus(d.configured ? '评测服务已就绪' : '评测服务尚未就绪');
    } catch {
      if (alive.current) setStatus('评测服务暂不可用，请稍后重试');
    }
  }, [provider, checkStatus]);
  useEffect(() => {
    // eslint-disable-next-line react/react-compiler -- Start an external service status request and expose its loading state when the selected provider changes.
    void check();
  }, [check]);
  const unavailable = Boolean(
    stage &&
    (!stage.ready ||
      !item ||
      (kind === 'sentence' && !stage.status.sentence.unlocked)),
  );
  const locked = busy || recording || unavailable;
  function clear() {
    operation.current++;
    playback.current?.pause();
    setBlob(null);
    setName('');
    setError('');
    setResult(null);
    setStatus((previous) =>
      previous === '本次评测已完成' ? '评测服务已就绪' : previous,
    );
  }
  function selectItem(id: string) {
    if (busyRef.current || recording) return;
    const next = stage?.items.find((i) => i.id === id);
    if (!next || (next.kind === 'sentence' && !stage?.status.sentence.unlocked))
      return;
    clear();
    // eslint-disable-next-line react/react-compiler -- Navigate the existing browser hash from an explicit user action.
    window.location.hash = `read/${id}`;
  }
  function showMap(
    nextKind: 'word' | 'sentence' = kind === 'sentence' ? 'sentence' : 'word',
  ) {
    if (
      busyRef.current ||
      recording ||
      (nextKind === 'sentence' && !stage?.status.sentence.unlocked)
    )
      return;
    clear();
    // eslint-disable-next-line react/react-compiler -- Navigate the existing browser hash from an explicit user action.
    window.location.hash = nextKind === 'sentence' ? 'sentences' : 'words';
  }
  async function start() {
    if (busyRef.current || rec.current?.state === 'recording' || unavailable)
      return;
    clear();
    busyRef.current = true;
    setBusy(true);
    const token = operation.current;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current || token !== operation.current) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = s;
      const recorder = new MediaRecorder(s);
      rec.current = recorder;
      const chunks: BlobPart[] = [];
      let failed = false;
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onstop = () => {
        clearTimeout(timer.current);
        s.getTracks().forEach((t) => t.stop());
        if (alive.current && token === operation.current) {
          if (!failed) {
            const captured = new Blob(chunks, { type: recorder.mimeType });
            setBlob(captured);
            setName('本次麦克风录音');
            void submit(captured);
          }
          setRecording(false);
        }
      };
      recorder.onerror = () => {
        failed = true;
        s.getTracks().forEach((t) => t.stop());
        clearTimeout(timer.current);
        if (alive.current) {
          setError('录音中断，请重录。');
          setRecording(false);
        }
      };
      recorder.start();
      setRecording(true);
      timer.current = setTimeout(
        () => {
          if (recorder.state === 'recording') recorder.stop();
        },
        provider === 'speechace' ? 30000 : kind === 'word' ? 20000 : 90000,
      );
    } catch {
      stream.current?.getTracks().forEach((t) => t.stop());
      if (alive.current)
        setError('无法访问麦克风，请检查权限，或上传录音文件。');
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function submit(captured?: Blob) {
    const audio = captured ?? blob;
    if (
      !audio ||
      !text.trim() ||
      busyRef.current ||
      (recording && !captured) ||
      unavailable
    )
      return;
    playback.current?.pause();
    busyRef.current = true;
    setBusy(true);
    setError('');
    setResult(null);
    const token = ++operation.current;
    const capturedId = item?.id;
    const controller = new AbortController();
    assessmentController.current = controller;
    setProcessing('正在处理录音…');
    const deadline = setTimeout(
      () => controller.abort(new Error('评测等待超时，录音已保留，可以重试。')),
      ASSESSMENT_TIMEOUT_MS,
    );
    try {
      const value = await abortable(
        () =>
          assess(kind, text, audio, provider, {
            signal: controller.signal,
            onPhase: (phase) => {
              if (
                alive.current &&
                token === operation.current &&
                !controller.signal.aborted
              )
                setProcessing(phase);
            },
          }),
        controller.signal,
      );
      if (!alive.current || token !== operation.current) return;
      if (value.kind !== kind || value.text.trim() !== text.trim())
        throw new Error('评测结果与当前题目不一致，请重新提交。');
      const computed = {
        ...value,
        calculatedScore: calculateScore(
          value.kind,
          value.metrics ?? value.result,
        ),
      };
      setResult(computed);
      setStatus(checkStatus ? '本次评测已完成' : '合成数据验证 · 未调用供应商');
      if (stage && capturedId) stage.record(capturedId, computed);
    } catch (e) {
      if (alive.current && token === operation.current)
        setError((e as Error).message);
    } finally {
      clearTimeout(deadline);
      if (assessmentController.current === controller)
        assessmentController.current = null;
      if (alive.current && token === operation.current) {
        busyRef.current = false;
        setBusy(false);
        setProcessing('');
      }
    }
  }
  useEffect(() => {
    onBusyChange?.(busy || recording);
  }, [busy, recording, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  const activeItems = stage?.items.filter((i) => i.kind === kind) ?? [];
  const activeIndex = activeItems.findIndex((i) => i.id === item?.id);
  const remainingOrder = [
    ...activeItems.slice(activeIndex + 1),
    ...activeItems.slice(0, activeIndex),
  ];
  const nextPending = remainingOrder.find(
    (i) => !stage?.status.items[i.id]?.passed,
  );
  const completedKind = navigation === '#complete/word' ? 'word' : navigation === '#complete/sentence' ? 'sentence' : null;
  if (stage && completedKind && (stage.status[completedKind].complete || isOpenPreview())) {
    return <StageCompletion preview={isOpenPreview() && !stage.status[completedKind].complete} stage={stage} kind={completedKind} onBack={() => showMap(completedKind)} onContinue={() => {
      window.location.hash = completedKind === 'word' ? 'sentences' : 'grammar';
    }} />;
  }
  if (stage && !reading)
    return (
      <ReadingMap
        stage={stage}
        kind={mapKind}
        onSelect={selectItem}
        onSwitchStage={showMap}
      />
    );
  const hasPassed =
    result?.calculatedScore?.value != null &&
    result.calculatedScore.value >= 80;
  const stageComplete = stage?.status[kind === 'sentence' ? 'sentence' : 'word'].complete;
  const phase = busy
    ? 'assessing'
    : recording
      ? 'recording'
      : result
        ? 'result'
        : error
          ? 'error'
          : blob
            ? 'ready'
            : 'idle';
  const canAdvance = Boolean(
    hasPassed &&
    (nextPending ||
      stageComplete),
  );
  function advance() {
    if (nextPending) selectItem(nextPending.id);
    else if (stage?.status[kind === 'sentence' ? 'sentence' : 'word'].complete)
      // Navigation changes the browser URL, not React state.
      // eslint-disable-next-line react/react-compiler
      window.location.hash = `complete/${kind}`;
    else showMap(kind === 'sentence' ? 'sentence' : 'word');
  }
  const primaryLabel = busy
    ? processing || '正在请求麦克风…'
    : recording
      ? '结束并评测'
      : result
        ? hasPassed
          ? !stage
            ? '再练一次'
            : canAdvance
              ? stageComplete
                ? '查看通关'
                : '下一题'
              : '返回地图'
          : '重新测试'
        : error && blob
          ? '重试评测'
          : blob
            ? '提交测评'
            : '开始录音';
  function primaryAction() {
    if (busy || unavailable) return;
    if (recording) {
      rec.current?.stop();
      return;
    }
    if (result) {
      if (hasPassed && stage) advance();
      else void start();
      return;
    }
    if (blob) void submit();
    else void start();
  }
  return (
    <section
      className={`speechsuper-panel ss-flow ${stage ? 'ss-reader' : 'ss-lab'}`}
      data-phase={phase}
      data-kind={kind}
      aria-label={
        stage
          ? t(kind === 'word' ? '单词朗读' : '句子朗读')
          : `${vendor} 词句评测`
      }
    >
      {stage ? (
        <div className="ss-reader-nav">
          <button onClick={() => showMap()} disabled={locked}>
            <ArrowLeftIcon size={19} aria-hidden="true" />
            {t('返回地图')}
          </button>
          <span>
            {String(
              activeItems.findIndex((i) => i.id === item?.id) + 1,
            ).padStart(2, '0')}{' '}
            / {activeItems.length}
          </span>
          <span>{t(kind === 'word' ? '单词朗读' : '句子朗读')}</span>
        </div>
      ) : (
        <div className="ss-fields">
          <label>
            练习类型
            <select
              value={freeKind}
              disabled={locked}
              onChange={(e) => {
                const value = e.target.value as 'word' | 'sentence';
                setFreeKind(value);
                setFreeText(defaults[value]);
                clear();
              }}
            >
              <option value="word">单词发音</option>
              <option value="sentence">句子朗读</option>
            </select>
          </label>
          <label>
            朗读内容
            <textarea
              value={freeText}
              disabled={locked}
              onChange={(e) => {
                setFreeText(e.target.value);
                clear();
              }}
            />
          </label>
        </div>
      )}
      <div className="ss-flow-title">
        <span>{t(kind === 'word' ? '请朗读单词' : '请朗读句子')}</span>
        <h1>{text}</h1>
      </div>
      <div className="ss-flow-workspace">
        {result ? (
          <section className="ss-flow-result" aria-label="评测结果">
            <ScoreSummary
              kind={result.kind}
              metrics={result.metrics ?? result.result}
              rawResult={result.result}
              audioUrl={url}
            />
          </section>
        ) : (
          <div className="ss-flow-display">
            {busy ? (
              <output className="ss-flow-message">
                <CircleNotchIcon
                  className="ss-flow-spinner"
                  size={52}
                  aria-hidden="true"
                />
                <strong>{t(processing || '正在请求麦克风…')}</strong>
                <span>{t('请留在当前题目，结果会显示在这里')}</span>
              </output>
            ) : recording ? (
              <output className="ss-flow-message">
                <MicrophoneIcon
                  className="ss-flow-live"
                  size={62}
                  weight="fill"
                  aria-hidden="true"
                />
                <strong>{t('正在录音')}</strong>
                <span>{t('读完后点击“结束并评测”')}</span>
              </output>
            ) : error ? (
              <div className="ss-flow-message">
                <WarningCircleIcon size={48} aria-hidden="true" />
                <p role="alert">{error}</p>
                {blob && <span>{t('录音已保留，重试评测会使用这段录音')}</span>}
              </div>
            ) : blob ? (
              <div className="ss-flow-message">
                <CheckCircleIcon size={48} aria-hidden="true" />
                <strong>{t('音频已准备好')}</strong>
                <span>{t('可以先试听，再提交评测')}</span>
              </div>
            ) : (
              <div className="ss-flow-message">
                <div className="ss-idle-symbol">{kind==='sentence'&&<WaveformIcon size={42} aria-hidden="true"/>}<MicrophoneIcon size={64} aria-hidden="true"/>{kind==='sentence'&&<WaveformIcon size={42} aria-hidden="true"/>}</div>
                {kind!=='sentence'&&<strong>{t('准备好就开始吧')}</strong>}
                <span>{t(kind === 'sentence' ? '完整朗读后结束录音，系统自动评测' : '朗读后结束录音，系统自动评测')}</span>
              </div>
            )}
            {blob && !busy && !recording && (
              <div className="ss-own-recording">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption -- Playback of the teacher's own submitted recording. */}
                <audio
                  ref={setPlaybackNode}
                  controls
                  src={url || undefined}
                  aria-label="回放待评测录音"
                />
                {!stage && <small>{name}</small>}
              </div>
            )}
          </div>
        )}
        {!result && (
          <div className="ss-flow-analysis-placeholder">{kind==='sentence'&&<span className="ss-sentence-dimension-labels">{['发音','流利度','完整度','韵律','速度'].map(label=><span key={label}>{t(label)}</span>)}</span>}</div>
        )}
        <div className="ss-flow-actions">
          <div className="ss-flow-primary-row">
            <button
              type="button"
              className="ss-flow-primary"
              onClick={primaryAction}
              disabled={busy || unavailable}
            >
              {recording ? (
                <SquareIcon size={20} weight="fill" aria-hidden="true" />
              ) : result && hasPassed ? (
                <ArrowRightIcon size={22} aria-hidden="true" />
              ) : !blob || result ? (
                <MicrophoneIcon size={22} aria-hidden="true" />
              ) : null}
              {t(primaryLabel)}
            </button>
            {busy && processing ? (
              <button
                type="button"
                className="ss-flow-secondary"
                onClick={() =>
                  assessmentController.current?.abort(
                    new Error('已取消等待，录音已保留。'),
                  )
                }
              >
                {t('取消等待')}
              </button>
            ) : !busy &&
              !recording &&
              ((result && hasPassed && stage) || (!result && blob)) ? (
              <button
                type="button"
                className="ss-flow-secondary"
                onClick={() => void start()}
                disabled={unavailable}
              >
                {t(result && hasPassed ? '再练一次' : '重新录音')}
              </button>
            ) : null}
          </div>
          <div className="ss-flow-caption">
            {busy ? (
              t('评测最多等待 75 秒')
            ) : recording ? (
              t('结束录音后自动提交')
            ) : result ? (
              hasPassed ? (
                !stage ? (
                  t('本次评测已完成')
                ) : canAdvance ? (
                  t('点击下一题继续，成绩已保存')
                ) : (
                  t('本关已完成')
                )
              ) : (
                t('重新测试会开启一段新录音')
              )
            ) : error ? (
              t('也可以重新录音')
            ) : (
              <label className="ss-upload">
                {t('上传音频')}
                <input
                  aria-label="上传录音"
                  type="file"
                  accept="audio/*,.wav,.mp3,.m4a,.webm"
                  disabled={locked}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    clear();
                    if (file) {
                      if (file.size > 20_000_000)
                        setError('文件超过 20MB，请缩短录音。');
                      else {
                        setBlob(file);
                        setName(file.name);
                      }
                    }
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
