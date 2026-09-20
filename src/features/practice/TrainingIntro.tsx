import { isOpenPreview } from './lib/previewMode';
import { useEffect, useState } from 'react';
import { preloadStageArtwork, scheduleStageArtwork } from './lib/preloadArtwork';
import {
  ArrowRightIcon,
  CheckCircleIcon,
  InfoIcon,
  LockKeyIcon,
  LockKeyOpenIcon,
} from '@phosphor-icons/react';
import { useI18n } from '../../shared/i18n/LanguageContext';
import styles from './TrainingIntro.module.css';

type TrainingIntroProps = {
  onStart: () => void;
  wordComplete?: boolean;
  pronunciationComplete?: boolean;
};

export default function TrainingIntro({
  onStart,
  wordComplete = false,
  pronunciationComplete = false,
}: TrainingIntroProps) {
  const { language, t } = useI18n();
  const openPreview = isOpenPreview();
  useEffect(scheduleStageArtwork, []);
  function enter(hash: string) {
    window.location.hash = hash;
    onStart();
  }
  // Preview is presentation state only; completion and entry still come from the existing props.
  const [selected, setSelected] = useState(() =>
    pronunciationComplete ? 2 : wordComplete ? 1 : 0,
  );
  const stages = [
    {
      title: '单词朗读',
      description: '逐词朗读 · 即时评分',
      artwork: '/images/intro-word-art.png',
      complete: wordComplete,
      locked: false,
      current: !wordComplete,
      status: wordComplete ? '本关已通过' : '从这里开始',
      rule: '本轮30个单词，每题 ≥ 80 分；全部通过后进入下一关。',
    },
    {
      title: '句子朗读',
      description: '完整朗读 · 再练习',
      artwork: '/images/intro-sentence-art.png',
      complete: pronunciationComplete,
      locked: !wordComplete && !openPreview,
      current: wordComplete && !pronunciationComplete,
      status: pronunciationComplete
        ? '本关已通过'
        : wordComplete
          ? '已解锁'
          : '单词全部通过后解锁',
      rule: '本轮20个句子，每题 ≥ 80 分；全部通过后进入下一关。',
    },
    {
      title: '语法测验',
      description: '选择答案 · 看解析',
      artwork: '/images/intro-grammar-art.png',
      complete: false,
      locked: !pronunciationComplete && !openPreview,
      current: pronunciationComplete,
      status: pronunciationComplete ? '已解锁' : '句子全部通过后解锁',
      rule: '30道语法题，每题提交一次；答对24题（80%）通过，未通过重考将打乱题序。',
    },
  ];

  return (
    <main
      className={styles.intro}
      id="top"
      aria-labelledby="training-intro-title"
      data-language={language}
    >
      <div className={styles.inner}>
        <header className={styles.heading}>
          <div className={styles.headingCopy}>
            <h1 id="training-intro-title">
              {t(
                selected === 2
                  ? '最后一关，语法测验'
                  : selected === 1
                    ? '下一站，句子朗读'
                    : '下一站，正式开练',
              )}
              <img
                className={styles.accent}
                src="/images/intro-accent.png"
                alt=""
              />
            </h1>
            <p className={styles.subtitle}>
              {t(
                openPreview
                  ? '体验版：三关开放，地图展示满分示例；录音返回真实评分'
                  : selected === 2 && pronunciationComplete
                    ? '朗读已完成，检验你的语法判断'
                    : selected === 1 && wordComplete
                      ? '单词关已完成，开始完整表达'
                      : '依次完成三关，逐项达标后解锁下一关',
              )}
            </p>
          </div>
          <div className={styles.headingArtwork} aria-hidden="true">
            <img
              className={styles.signature}
              src="/images/intro-signature.png"
              alt=""
            />
            <p className={styles.editorialNote}>
              A<br />
              GLOBAL CLASSROOM
              <br />A BRIGHTER
              <br />
              TOMORROW
            </p>
          </div>
        </header>

        <section className={styles.journey} aria-label={t('三关训练路线')}>
          <ol className={styles.stages} data-selected={selected}>
            {stages.map(
              (
                {
                  title,
                  description,
                  artwork,
                  complete,
                  locked,
                  current,
                  status,
                },
                index,
              ) => (
                <li
                  className={styles.stage}
                  data-expanded={selected === index}
                  data-complete={complete}
                  key={title}
                  aria-current={current ? 'step' : undefined}
                >
                  <button
                    type="button"
                    className={styles.previewButton}
                    onPointerEnter={() => { void preloadStageArtwork(index); }}
                    onFocus={() => { void preloadStageArtwork(index); }}
                    onClick={() => { void preloadStageArtwork(index); setSelected(index); }}
                    aria-label={`${t('查看章节介绍')}：${t(title)}`}
                    aria-expanded={selected === index}
                    aria-controls="intro-chapter-description"
                    aria-describedby={`intro-stage-status-${index}`}
                  />
                  <div className={styles.stageContent}>
                    <p className={styles.stageNumber} aria-hidden="true">
                      <span>0{index + 1}</span>
                      <span className={styles.numberLine} />
                    </p>
                    <span className={styles.watermark} aria-hidden="true">
                      0{index + 1}
                    </span>
                    <h2>{t(title)}</h2>
                    <p className={styles.stageDescription}>{t(description)}</p>
                    {index > 0 && !locked && !complete && (
                      <p className={styles.unlocked}>
                        <LockKeyOpenIcon size={16} weight="fill" aria-hidden="true" />
                        <span>{t('已解锁')}</span>
                      </p>
                    )}
                    <div
                      className={`${styles.illustration} ${index === 0 ? styles.wordIllustration : styles.chapterIllustration}`}
                      data-has-copy={index > 0 && !locked}
                    >
                      {index > 0 && !locked && (
                        <div className={styles.chapterCopy}>
                          <strong>{index === 1 ? "Let’s talk" : "A or B?"}</strong>
                          <span>{index === 1 ? "SAY IT WITH CONFIDENCE" : "THINK. CHOOSE. SHINE."}</span>
                        </div>
                      )}
                      <img src={artwork} alt="" draggable="false" />
                      {complete && (
                        <CheckCircleIcon
                          className={styles.completeMark}
                          weight="fill"
                          aria-label={t('已完成')}
                        />
                      )}
                    </div>
                  </div>
                  <div className={styles.stageFooter}>
                    {locked ? (
                      <div
                        className={styles.lockStatus}
                        id={`intro-stage-status-${index}`}
                        aria-label={t(status)}
                      >
                        <LockKeyIcon
                          size={26}
                          weight="fill"
                          aria-hidden="true"
                        />
                        <span>{t('待解锁')}</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={styles.startButton}
                        onClick={() =>
                          enter(
                            index === 0
                              ? 'words'
                              : index === 1
                                ? 'sentences'
                                : 'grammar',
                          )
                        }
                        id={`intro-stage-status-${index}`}
                      >
                        {complete && (
                          <CheckCircleIcon
                            size={25}
                            weight="fill"
                            aria-hidden="true"
                          />
                        )}
                        <span>
                          {t(
                            complete
                              ? index === 0
                                ? '回顾单词'
                                : '回顾句子'
                              : index === 0
                                ? '开始第一关'
                                : index === 1
                                  ? '开始第二关'
                                  : '开始第三关',
                          )}
                        </span>
                        <ArrowRightIcon
                          size={30}
                          weight="bold"
                          aria-hidden="true"
                        />
                      </button>
                    )}
                  </div>
                </li>
              ),
            )}
          </ol>
        </section>

        <footer className={styles.footer}>
          <div className={styles.footerCopy}>
            <p className={styles.previewHint}>
              <InfoIcon size={23} aria-hidden="true" />
              {t('点击章节可查看介绍')}
            </p>
            <p
              className={styles.chapterDescription}
              id="intro-chapter-description"
              aria-live="polite"
            >
              <strong>{t(stages[selected].title)}</strong>
              <span>
                {t(stages[selected].rule)} {t('重试次数不限')}
              </span>
              {stages[selected].locked && (
                <span className={styles.unlockHint}>
                  {t(stages[selected].status)}
                </span>
              )}
            </p>
            <p className={styles.sampleNote}>
              {t('词句采用 FT 清单；语法采用 FT Questions 原题与解析')}
            </p>
          </div>
          <p className={styles.footerSignature} aria-hidden="true">
            BETTER TEACHERS
            <br />
            BRIGHTER PEOPLE
          </p>
        </footer>
      </div>
    </main>
  );
}
