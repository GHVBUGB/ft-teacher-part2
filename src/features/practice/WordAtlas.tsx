import { useState } from 'react';
import { isOpenPreview } from './lib/previewMode';
import { ArrowRightIcon, CheckIcon, InfoIcon, LockKeyIcon, MapPinIcon } from '@phosphor-icons/react';
import type { StageTraining } from './useStageTraining';
import { useI18n } from '../../shared/i18n';
import './WordAtlas.css';
import './ScenicAtlas.css';
import './ClassroomAtlas.css';

// Map positions are presentation coordinates only, never assessment or catalog data.
const stops = [
  [10.603, 67.073],
  [19.561, 44.124],
  [34.644, 26.497],
  [57.678, 18.847],
  [81.079, 25.166],
  [88.300, 38.581],
  [91.590, 53.991],
  [89.031, 66.408],
  [72.212, 72.173],
  [57.678, 76.386],
  [41.682, 72.284],
  [55.500, 56.000],
  [51.737, 46.120],
];
const number = (value: number) => String(value).padStart(2, '0');

export default function WordAtlas({ stage, onSelect, onSwitchStage }: {
  stage: StageTraining;
  onSelect: (id: string) => void;
  onSwitchStage: (kind: 'word' | 'sentence') => void;
}) {
  const { t } = useI18n();
  const openPreview = isOpenPreview();
  const words = stage.items.filter(item => item.kind === 'word');
  const groups = Array.from({ length: Math.ceil(words.length / 8) }, (_, index) => words.slice(index * 8, index * 8 + 8));
  const nextIndex = words.findIndex(item => !stage.status.items[item.id]?.passed);
  const nextGroup = nextIndex < 0 ? 0 : Math.floor(nextIndex / 8);
  const progressGroup = nextIndex < 0 ? Math.max(0, groups.length - 1) : nextGroup;
  const [previewGroup, setPreviewGroup] = useState<number | null>(null);
  const activeGroup = Math.min(previewGroup ?? nextGroup, Math.max(0, groups.length - 1));
  const activeItems = groups[activeGroup] ?? [];
  const passed = activeItems.filter(item => stage.status.items[item.id]?.passed).length;
  const nextItem = activeItems.find(item => !stage.status.items[item.id]?.passed);
  const continueItem = nextIndex >= 0 ? words[nextIndex] : undefined;

  return <section className="word-atlas scenic-atlas classroom-atlas" data-open-preview={openPreview || undefined} aria-label={t('单词朗读地图')}>
    <div className="atlas-geography">
      <header className="atlas-heading">
        <h1>{t('单词朗读')}</h1>
        <p>{t('全部')} {words.length} {t('词')} · {t('每题80分通过')}</p>
      </header>
      <div className="atlas-scene">
        <div className="atlas-world">
          <img className="atlas-terrain" src="/images/word-classroom.png" alt="" draggable={false} />
          {groups.length > 4 && <svg className="atlas-final-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path className="atlas-route-outline" d="M 41.682 72.284 C 43 64, 53 65, 55.5 56 S 54 49, 51.737 46.12" />
            <path className="atlas-route-dashes" d="M 41.682 72.284 C 43 64, 53 65, 55.5 56 S 54 49, 51.737 46.12" />
          </svg>}
          <svg className="classroom-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M12 67 C21 67 23 57 27 55 S37 45 42 43 S50 33 56 31" /></svg>
          <nav className="atlas-stops" aria-label={t('选择单词区域')}>
            {groups.map((group, index) => {
              const completed = openPreview ? group.length : group.filter(item => stage.status.items[item.id]?.passed).length;
              const [x, y] = (groups.length <= 4 ? [[12,67],[27,55],[42,43],[56,31]][index] : stops[index]) ?? [50,50];
              return <button key={group[0].id} type="button" className="atlas-stop"
                style={{
                  left: `clamp(calc((100% - 100cqw) / 2 + 32px), ${x}%, calc((100% + 100cqw) / 2 - 32px))`,
                  top: `clamp(calc((100% - 100cqh) / 2 + 48px), ${y}%, calc((100% + 100cqh) / 2 - 48px))`,
                }}
                aria-label={`${t('区域')} ${number(index + 1)} · ${number(index * 8 + 1)}–${number(index * 8 + group.length)} · ${completed}/${group.length} ${t('已通过')}`}
                aria-pressed={activeGroup === index} data-progress={progressGroup === index || undefined} data-complete={completed === group.length || undefined}
                title={`${number(index * 8 + 1)}–${number(index * 8 + group.length)}`} 
                onClick={() => setPreviewGroup(index)}>
                {progressGroup === index ? <span className="atlas-avatar-marker">
                  <span className="atlas-portrait"><img src="/images/zhang-linghe.png" alt={t('张凌赫头像')} draggable={false} /></span>
                  <span className="atlas-avatar-number">{number(index + 1)}</span>
                  <MapPinIcon className="atlas-avatar-pin" size={20} weight="fill" aria-hidden="true" />
                </span> : <span>{number(index + 1)}</span>}
                <small>{completed}/{group.length}</small>
              </button>;
            })}
          </nav>
        </div>
      </div>
      <div className="classroom-partner"><span>{t('练习伙伴')}</span><p>{t('别着急，我们一步一步来。')}</p></div>
      <p className="classroom-encouragement">{t('每一次练习，都离课堂更近一步。')}</p>
      <p className="atlas-map-note"><InfoIcon size={18} aria-hidden="true" />{t('每个区域8词，可自由切换。')}<a className="atlas-photo-credit" href="https://commons.wikimedia.org/wiki/File:Zhang_Linghe_1.png" target="_blank" rel="noreferrer" title="iQIYI Indonesia · CC BY 3.0 · CSS circular crop">{t('头像来源')}</a></p>
    </div>
    <aside className="atlas-panel" aria-labelledby="atlas-area-heading">
      <header className="atlas-panel-heading">
        <h2 id="atlas-area-heading">{t('当前区域')} {number(activeGroup + 1)}</h2>
        <p><strong>{openPreview ? activeItems.length : passed}<span>/{activeItems.length}</span></strong> {t('已通过')}</p>
      </header>
      <ol className="atlas-word-list" aria-label={t('当前区域单词')}>
        {activeItems.map((item, index) => {
          const status = openPreview ? { ...stage.status.items[item.id], passed: true, bestScore: 100 } : stage.status.items[item.id];
          const locked = !openPreview && !status?.passed && !status?.attemptCount && item.id !== words[nextIndex]?.id;
          return <li key={item.id}>
            <button type="button" className="atlas-word" data-passed={status?.passed || undefined} data-unlocked={!locked || undefined}
              data-next={!openPreview && !locked && nextItem?.id === item.id || undefined} data-locked={locked || undefined} disabled={!stage.ready || locked}
              aria-label={`${number(activeGroup * 8 + index + 1)} · ${item.text} · ${t(locked ? '待解锁' : status?.passed ? '已通过' : status?.lastScore != null ? '待重练' : '开始测试')}`}
              onClick={() => { if (!locked) onSelect(item.id); }}>
              <span className="atlas-word-number">{number(activeGroup * 8 + index + 1)}</span>
              <strong>{item.text}{status?.passed && <small className="atlas-result-score">{status.bestScore} / 100</small>}</strong>
              {locked && <LockKeyIcon className="atlas-item-lock" size={20} weight="light" aria-hidden="true" />}
              {status?.passed ? <CheckIcon className="atlas-passed-icon" size={22} weight="bold" aria-hidden="true" /> : !locked && <ArrowRightIcon size={21} aria-hidden="true" />}
            </button>
          </li>;
        })}
      </ol>
      {stage.error && <p role="alert" className="ss-error">{stage.error}</p>}
      <div className="atlas-panel-footer">
        {stage.status.word.complete ? <button className="atlas-continue" type="button" onClick={() => onSwitchStage('sentence')}>
          {t('进入句子朗读')}<ArrowRightIcon size={25} aria-hidden="true" />
        </button> : <button className="atlas-continue" type="button" disabled={!stage.ready || !continueItem} onClick={() => continueItem && onSelect(continueItem.id)}>
          <span>{t(stage.status.word.passed ? '继续朗读' : '开始朗读')}</span><ArrowRightIcon size={25} aria-hidden="true" />
        </button>}
        <p>{t('全部')} {openPreview ? words.length : stage.status.word.passed}/{words.length} {t('已通过')} · {t(openPreview ? '满分通过预览' : '记录保存在当前浏览器')}</p>
      </div>
    </aside>
  </section>;
}
