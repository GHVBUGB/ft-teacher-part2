import { useState } from 'react';
import { ArrowRightIcon, CheckCircleIcon, CalendarBlankIcon, UserCircleIcon, ArrowLeftIcon } from '@phosphor-icons/react';
import { useI18n } from '../../shared/i18n';
import './StageCompletion.css';
import './AllStagesComplete.css';

/** A visual handoff only. It never creates an appointment or changes a score. */
export default function AllStagesComplete({ completed, preview = false, onBack, onRetryGrammar }: { completed: boolean; preview?: boolean; onBack: () => void; onRetryGrammar?: () => void }) {
  const { t } = useI18n();
  const [guide, setGuide] = useState(false);
  if (!completed && !preview) return null;
  return <section className="stage-completion all-stages-complete" aria-label={t('三关全部通过')}>
    {preview && <p className="completion-preview" role="status">{t('页面预览 · 不代表实际通过')}</p>}
    <header className="completion-title">
      <h1>{t(guide ? '下一站，真人培训' : '第三关，通关！')}<img src="/images/intro-accent.png" alt="" /></h1>
      <p>{t(guide ? '把练习成果带进真实课堂' : '三关训练已完成，准备进入真人培训')}</p>
    </header>
    {!guide ? <>
      <img className="completion-island" src="/images/stage-complete-island.png" alt="" />
      <ol className="completion-stages" aria-label={t('三关训练路线')}>
        {['单词朗读','句子朗读','语法测验'].map((label,index)=><li key={label} data-done><CheckCircleIcon weight="fill"/><span><strong>0{index+1} {t(label)}</strong><small>{t('已完成')}</small></span></li>)}
      </ol>
      <div className="training-next"><UserCircleIcon size={36}/><div><strong>FT Signature Flow</strong><span>{t('真人培训 · 与培训师一起练习教学流程')}</span></div></div>
      <div className="completion-actions"><button onClick={()=>setGuide(true)}>{t('查看真人培训预约指引')}<ArrowRightIcon size={24}/></button><button className="completion-back" onClick={onBack}>{t('返回关卡介绍')}</button>{onRetryGrammar && <button className="completion-back" onClick={onRetryGrammar}>{t('重新体验第三关')}</button>}</div>
    </> : <>
      <div className="training-guide">
        <div className="training-guide-heading"><CalendarBlankIcon size={38}/><div><strong>FT Signature Flow</strong><p>{t('真人培训预约步骤')}</p></div></div>
        <ol>
          <li><span>01</span><div><strong>{t('打开 My Page')}</strong><p>{t('登录教师端，进入个人页面。')}</p></div></li>
          <li><span>02</span><div><strong>Book My Training</strong><p>{t('找到培训预约入口。')}</p></div></li>
          <li><span>03</span><div><strong>FT Signature Flow</strong><p>{t('选择培训场次，并在 My Page 确认预约结果。')}</p></div></li>
        </ol>
        <p className="training-link-pending">{t('正式预约链接待提供；此处仅展示指引。')}</p>
      </div>
      <div className="completion-actions"><button onClick={onBack}>{t('返回关卡介绍')}<ArrowRightIcon size={24}/></button><button className="completion-back" onClick={()=>setGuide(false)}><ArrowLeftIcon size={16}/>{t('返回通关页')}</button></div>
    </>}
  </section>;
}
