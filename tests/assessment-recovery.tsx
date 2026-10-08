import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {LanguageProvider} from '../src/shared/i18n';
import SpeechSuperPanel from '../src/features/practice/SpeechSuperPanel';
import {assessSpeech, toWav, type SpeechResult} from '../src/features/practice/lib/speechsuper';
function Harness(){
 const [mode,setMode]=useState('failure');const [calls,setCalls]=useState(0);
 const [late,setLate]=useState<(()=>void)|null>(null);
 const assess:typeof assessSpeech=async(kind,text,audio,provider,options)=>{
  setCalls(n=>n+1);
  if(mode==='live')return assessSpeech(kind,text,audio,provider,options);
  await toWav(audio);
  options?.onPhase?.('正在等待评测结果…');
  const value:SpeechResult={id:crypto.randomUUID(),kind,text,provider:'synthetic',duration:1,result:{pronunciation:90,stress:90,intelligibility:90},scale:'0-100',qualification:'合成测试'};
  if(mode==='failure')throw Error('SpeechSuper 响应超时，请稍后重试。');
  if(mode==='pending')return new Promise(resolve=>setLate(()=>()=>resolve(value)));
  return value;
 };
 async function load(){
  const data=await(await fetch('/samples/ft-word-brown.wav')).blob();
  const input=document.querySelector<HTMLInputElement>('input[type=file]')!;
  const dt=new DataTransfer();dt.items.add(new File([data],'brown-example.wav',{type:'audio/wav'}));
  input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
 }
 return <main><aside><b>隔离测试：示范音频，模拟结果不保存到老师成绩</b><p>模式：<select aria-label="测试模式" value={mode} onChange={e=>setMode(e.target.value)}><option value="failure">模拟服务失败</option><option value="pending">模拟一直等待</option><option value="success">模拟成功</option><option value="live">真实供应商（示范音频）</option></select> <button onClick={load}>载入示范音频</button> <button onClick={()=>late?.()}>返回已取消的旧结果</button></p><output>本页提交 {calls} 次</output></aside><SpeechSuperPanel assess={assess} checkStatus={mode==='live'}/></main>
}
createRoot(document.getElementById('root')!).render(<LanguageProvider><style>{`body{margin:0;background:#f4f8ff;font:14px system-ui;color:#123}main{max-width:850px;margin:20px auto}aside{background:#fff0bf;padding:15px;margin-bottom:16px}button,select{font:inherit} .speechsuper-panel{padding:20px!important}.ss-actions{margin:12px 0!important}`}</style><Harness/></LanguageProvider>);
