import {
  ArrowRightIcon,
  CheckCircleIcon,
  LockKeyIcon,
  CircleIcon,
} from '@phosphor-icons/react';
import { useI18n } from '../../shared/i18n';
import type { StageTraining } from './useStageTraining';
import './StageCompletion.css';

export default function StageCompletion({
  stage,
  kind,
  onContinue,
  onBack,
  preview = false,
}: {
  preview?: boolean;
  stage: StageTraining;
  kind: 'word' | 'sentence';
  onContinue: () => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  if (!preview && !stage.status[kind].complete) return null;
  const second = kind === 'sentence';
  return (
    <section
      className="stage-completion"
      aria-label={t(second ? '第二关通关' : '第一关通关')}
    >
      {preview && <p className="completion-preview" role="status">{t('页面预览 · 不代表实际通过')}</p>}
      <header className="completion-title">
        <h1>
          {t(second ? '第二关，通关！' : '第一关，通关！')}
          <img src="/images/intro-accent.png" alt="" />
        </h1>
        <p>
          <strong>{stage.status[kind].total}</strong>{' '}
          {t(second ? '个句子，全部通过' : '个单词，全部通过')}
        </p>
      </header>
      <img
        className="completion-island"
        src="/images/stage-complete-island.png"
        alt=""
      />
      <ol className="completion-stages" aria-label={t('三关训练路线')}>
        {['单词朗读', '句子朗读', '语法测验'].map((label, index) => {
          const done = index < (second ? 2 : 1);
          const unlocked =
            done || index === (second ? 2 : 1);
          return (
            <li key={label} data-done={done || undefined}>
              {done ? (
                <CheckCircleIcon weight="fill" />
              ) : unlocked ? (
                <CircleIcon />
              ) : (
                <LockKeyIcon weight="fill" />
              )}
              <span>
                <strong>
                  0{index + 1} {t(label)}
                </strong>
                <small>
                  {t(done ? '已完成' : unlocked ? '已解锁' : '待解锁')}
                </small>
              </span>
              {index < 2 && (
                <ArrowRightIcon className="completion-step-arrow" />
              )}
            </li>
          );
        })}
      </ol>
      <div className="completion-actions">
        <button onClick={onContinue}>
          {t(second ? '进入第三关' : '进入第二关')}
          <ArrowRightIcon size={25} />
        </button>
        <button className="completion-back" onClick={onBack}>
          {t(second ? '返回句子列表' : '返回地图')}
        </button>
      </div>
    </section>
  );
}
