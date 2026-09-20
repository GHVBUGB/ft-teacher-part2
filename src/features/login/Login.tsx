import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEMO_ENROLLMENT_ID } from '../../shared/api/client';
import './Login.css';

/** Demo navigation only. Does not authenticate users or persist email addresses. */
export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [sentEmail, setSentEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const normalizedEmail = email.trim().toLowerCase();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  const cooldown = Math.max(0, 60 - Math.floor((now - sentAt) / 1000));
  const expired = sentAt > 0 && now - sentAt >= 300000;
  const locked = attempts >= 5;
  const matches = sentEmail === normalizedEmail;
  function send() {
    if (!emailValid || cooldown || locked) return;
    const time = Date.now(); setSentAt(time); setNow(time);
    setSentEmail(normalizedEmail); setCode(''); setError('');
  }
  function login(event: React.FormEvent) {
    event.preventDefault();
    if (!sentAt || !matches || locked) return;
    if (Date.now() - sentAt >= 300000) { setError('验证码已过期，请重新获取。'); return; }
    if (code !== '246810') {
      const next = attempts + 1; setAttempts(next);
      setError(next >= 5 ? '尝试次数过多，请刷新页面重新体验。' : '验证码不正确，请检查后重试。');
      return;
    }
    navigate(`/training/${DEMO_ENROLLMENT_ID}/practice?test=acceptance`, { replace: true });
  }
  return <div className="ft-login">
    <header className="fl-header"><a href="/login" className="fl-brand">51Talk<span>FT 教师培训</span></a><span className="fl-badge">Demo 体验版</span></header>
    <main className="fl-main">
      <section className="fl-welcome"><span className="fl-eyebrow">TEACH WITH CONFIDENCE</span><h1>准备好，<br/>迎接你的课堂。</h1><p>从每一次练习开始，<br/>让教学更自信。</p><div className="fl-stages"><span><b>01</b> 单词朗读</span><span><b>02</b> 句子朗读</span><span><b>03</b> 语法测验</span></div><div className="fl-art" aria-hidden="true"><span>Hello!</span><small>YOUR NEXT CHAPTER STARTS HERE</small></div></section>
      <section className="fl-card" aria-labelledby="login-title"><span className="fl-card-label">WELCOME BACK</span><h2 id="login-title">登录教师培训</h2><p>使用公司登记的邮箱，继续你的培训。</p><form onSubmit={login}>
        <label htmlFor="teacher-email">邮箱地址</label><input id="teacher-email" type="email" autoComplete="email" placeholder="teacher@example.com" required value={email} onChange={e => { setEmail(e.target.value); setCode(''); setError(''); }}/>
        <label htmlFor="email-code">邮箱验证码</label><div className="fl-code-row"><input id="email-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6位验证码" value={code} disabled={!sentAt || !matches || locked} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}/><button type="button" onClick={send} disabled={!emailValid || cooldown > 0 || locked}>{cooldown > 0 ? `${cooldown}秒后重发` : sentAt ? '重新获取' : '获取验证码'}</button></div>
        <output className="fl-message">{sentAt ? !matches ? '邮箱已修改，请重新获取验证码。' : expired ? '验证码已过期，请重新获取。' : '已模拟发送，演示验证码：246810（5分钟有效）' : '请输入邮箱并获取验证码。'}</output>
        {error && <p className="fl-error" role="alert">{error}</p>}
        <button className="fl-submit" type="submit" disabled={!emailValid || !sentAt || !matches || code.length !== 6 || expired || locked}>登录并开始培训 <span>→</span></button>
      </form><p className="fl-help">邮箱无法使用？请联系培训负责人。</p><div className="fl-demo-note">当前为模拟登录，不发送邮件，不验证公司账号。邮箱不会保存；进入后使用统一演示身份。</div></section>
    </main><footer className="fl-footer">51Talk · FT Teacher Training</footer>
  </div>;
}
