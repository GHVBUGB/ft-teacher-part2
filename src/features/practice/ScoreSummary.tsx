import { Fragment, useCallback, useId, useRef, useState } from 'react';
import {
  CaretDownIcon,
  PauseIcon,
  SpeakerHighIcon,
} from '@phosphor-icons/react';
import { calculateScore } from './lib/score';
import { getScoreDetails } from './lib/scoreDetails';
import './ScoreSummary.css';

type Props = {
  kind: string;
  metrics: Record<string, unknown>;
  rawResult?: Record<string, unknown>;
  audioUrl?: string;
};

export default function ScoreSummary({
  kind,
  metrics,
  rawResult,
  audioUrl,
}: Props) {
  const calculated = calculateScore(kind, metrics);
  const details = getScoreDetails(kind, metrics, rawResult);
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const [playing, setPlaying] = useState(false);
  const [playError, setPlayError] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const setAudioNode = useCallback((node: HTMLAudioElement | null) => {
    // React detaches refs before passive-effect cleanup; pause the actual old node.
    audio.current?.pause();
    audio.current = node;
  }, []);
  const id = useId();
  const passed = calculated.value !== null && calculated.value >= 80;
  function toggle(index: number) {
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }
  async function play() {
    if (!audio.current) return;
    if (!audio.current.paused) {
      audio.current.pause();
      return;
    }
    setPlayError(false);
    try {
      await audio.current.play();
    } catch {
      setPlayError(true);
    }
  }
  return (
    <section className="assessment-summary" aria-label="发音评测结果">
      <div className="assessment-overview">
      <div className="assessment-total" aria-live="polite">
        <h3>总分</h3>
        {calculated.value === null ? (
          <output className="assessment-unavailable">
            评测数据不完整，暂无法计算总分，请重新评测。
          </output>
        ) : (
          <>
            <div className="assessment-score-pill">
              <strong>{calculated.value}</strong>
              <span className="assessment-score-unit">/ 100</span>
              {audioUrl && (
                <button
                  type="button"
                  className="assessment-play"
                  onClick={play}
                  aria-label={playing ? '暂停本次录音' : '回放本次录音'}
                >
                  {playing ? (
                    <PauseIcon aria-hidden="true" size={24} />
                  ) : (
                    <SpeakerHighIcon aria-hidden="true" size={27} />
                  )}
                </button>
              )}
            </div>
            <p
              className={`assessment-verdict ${passed ? 'is-passed' : 'needs-practice'}`}
            >
              {passed ? '本题通过' : '本题未通过，请再练习'}
              <span> · 80 分及以上通过</span>
            </p>
          </>
        )}
        {audioUrl && (
          // eslint-disable-next-line jsx-a11y/media-has-caption -- Teacher's own recording; no transcript or captions have been returned.
          <audio
            ref={setAudioNode}
            src={audioUrl}
            preload="none"
            aria-label="本次练习录音"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onError={() => {
              setPlaying(false);
              setPlayError(true);
            }}
          />
        )}
        {playError && (
          <p role="alert" className="assessment-audio-error">
            录音暂时无法播放，请重新录音。
          </p>
        )}
      </div>
      <dl className="assessment-dimensions" aria-label="各维度评分">
        {details.dimensions.map((d) => (
          <div key={d.key}>
            <dt>
              {d.label}
              {d.unit && <small>（{d.unit}）</small>}
            </dt>
            <dd className={d.value === null ? 'is-missing' : ''}>
              {d.value ?? '未返回'}
            </dd>
          </div>
        ))}
      </dl>
      </div>
      <details className="assessment-analysis">
        <summary>查看分析 <CaretDownIcon size={18} aria-hidden="true" /></summary>
      {details.feedback.length > 0 && (
        <section className="assessment-feedback" aria-label="具体反馈">
          <h4>具体反馈</h4>
          <ul>
            {details.feedback.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </section>
      )}
      <section
        className="assessment-word-results"
        aria-labelledby={`${id}-words`}
      >
        <h3 id={`${id}-words`}>词级评估结果</h3>
        {details.words.length === 0 ? (
          <p className="assessment-empty">本次评测未返回词级或音素明细。</p>
        ) : (
          <div className="assessment-table-scroll">
            <table className="assessment-word-table">
              <thead>
                <tr>
                  <th scope="col">单词</th>
                  <th scope="col">质量评分</th>
                  <th scope="col">音素级分析</th>
                </tr>
              </thead>
              <tbody>
                {details.words.map((w, index) => (
                  <Fragment key={`${index}-${w.word}`}>
                    <tr>
                      <th scope="row" lang="en">
                        {w.word}
                      </th>
                      <td>{w.score ?? '未返回'}</td>
                      <td>
                        <button
                          type="button"
                          className="assessment-expand"
                          aria-expanded={open.has(index)}
                          aria-controls={`${id}-word-${index}`}
                          onClick={() => toggle(index)}
                        >
                          <span>
                            {open.has(index) ? '收起分析' : '查看分析'}
                          </span>
                          <CaretDownIcon
                            size={21}
                            className={open.has(index) ? 'is-open' : ''}
                            aria-hidden="true"
                          />
                          <span className="assessment-visually-hidden">
                            ：{w.word}
                          </span>
                        </button>
                      </td>
                    </tr>
                    <tr
                      className="assessment-detail-row"
                      hidden={!open.has(index)}
                    >
                      <td colSpan={3} id={`${id}-word-${index}`}>
                        {w.feedback.length > 0 && (
                          <ul className="assessment-word-feedback">
                            {w.feedback.map((f, i) => (
                              <li key={i}>{f}</li>
                            ))}
                          </ul>
                        )}
                        {w.phonemes.length === 0 ? (
                          <p className="assessment-empty">
                            本次评测未返回该词的音素明细。
                          </p>
                        ) : (
                          <table
                            className="assessment-phoneme-table"
                            aria-label={`${w.word} 的音素分析`}
                          >
                            <thead>
                              <tr>
                                <th scope="col">参考音素</th>
                                <th scope="col">发音评分</th>
                                <th scope="col">识别音素</th>
                                <th scope="col">具体反馈</th>
                              </tr>
                            </thead>
                            <tbody>
                              {w.phonemes.map((p, i) => (
                                <tr key={i}>
                                  <th scope="row">/{p.symbol}/</th>
                                  <td>{p.score ?? '未返回'}</td>
                                  <td>
                                    {p.recognized
                                      ? `/${p.recognized}/`
                                      : '未返回'}
                                  </td>
                                  <td>
                                    {p.feedback.length ? (
                                      <ul>
                                        {p.feedback.map((f, k) => (
                                          <li key={k}>{f}</li>
                                        ))}
                                      </ul>
                                    ) : (
                                      '未返回具体问题说明'
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {details.tone && (
        <section className="assessment-tone">
          <h3>语调</h3>
          <p>{details.tone}</p>
        </section>
      )}
      </details>
    </section>
  );
}
