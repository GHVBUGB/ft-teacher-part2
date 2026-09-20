import { useTraining } from '../auth/TrainingContext';
import { useI18n } from '../i18n';
import { Button } from './button';
import { TranslateIcon } from '@phosphor-icons/react';
import styles from './TrainingHeader.module.css';
import { Link, useLocation } from 'react-router-dom';
const css = (names: string) =>
  names
    .split(/\s+/)
    .map((name) => styles[name] ?? name)
    .join(' ');
export default function TrainingHeader() {
  const training = useTraining();
  const location = useLocation();
  const { language, setLanguage, t } = useI18n();
  const isIntroduction = location.pathname.replace(/\/$/, '') === `/training/${training.enrollment_id}/practice`;
  return (
    <header className={`${css('topbar')} ${isIntroduction ? styles.introductionHeader : ''}`}>
      <Link className={css('brand')} to={`/training/${training.enrollment_id}/practice${location.search}`} aria-label={t('51Talk 教师培训首页')}>
        <img src="/51talk-logo.svg" alt="51Talk" width="141" height="32" />
      </Link>
      <span className={css('course-label')}>
        {language === 'zh-CN' ? 'FT 教师培训' : 'FT Teacher Training'}
      </span>
      <div className={css('identity')}>
        <span className={css('avatar')}>FT</span>
        <div>
          {training.teacher.display_name === 'Demo Teacher' ? t('演示老师') : training.teacher.display_name}
          <small>{t('本地练习空间')}</small>
        </div>
      </div>
      {isIntroduction ? (
        <div className={styles.languageChoices} aria-label={t('语言切换')}>
          <button type="button" lang="zh-CN" aria-pressed={language === 'zh-CN'} onClick={() => setLanguage('zh-CN')}>中文</button>
          <span aria-hidden="true">/</span>
          <button type="button" lang="en" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
        </div>
      ) : <Button
        variant="outline"
        className={css('language-toggle')}
        onClick={() => setLanguage(language === 'en' ? 'zh-CN' : 'en')}
        aria-label={language === 'en' ? '切换为中文' : 'Switch to English'}
        lang={language === 'en' ? 'zh-CN' : 'en'}
      >
        <TranslateIcon aria-hidden="true" />
        {language === 'en' ? '中文' : 'English'}
      </Button>}
    </header>
  );
}
