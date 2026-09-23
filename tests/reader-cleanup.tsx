/// <reference types="vite/client" />
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { LanguageProvider } from '../src/shared/i18n';
import { stageItems } from '../src/features/practice/lib/stageCatalog';
import { CONTENT_VERSION } from '../src/features/practice/lib/catalog';
import { useStageTraining } from '../src/features/practice/useStageTraining';
import SpeechSuperPanel from '../src/features/practice/SpeechSuperPanel';
import type { SpeechKind, SpeechResult } from '../src/features/practice/lib/speechsuper';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
const context = { teacherId:'SYNTHETIC-READER-CLEANUP-QA', enrollmentId:'SYNTHETIC-READER-CLEANUP-QA', contentVersion:CONTENT_VERSION };
const key = `ft-practice:stages:v1:${context.teacherId}:${context.enrollmentId}:${context.contentVersion}:reader-cleanup-qa`;
const words = stageItems.filter(item=>item.kind==='word');
function result(kind: SpeechKind, text:string, score=80): SpeechResult {
  const metrics = kind==='word' ? {pronunciation:score,stress:90,intelligibility:92} : {pronunciation:score,fluency:score,rhythm:score,integrity:100};
  return {id:crypto.randomUUID(),kind,text,provider:'synthetic',duration:1,result:metrics,scale:'0-100',qualification:'合成测试，不代表真人评分'};
}
function Harness() {
  const stage=useStageTraining(context,stageItems,'reader-cleanup-qa');
  const [calls,setCalls]=useState(0);
  const [score,setScore]=useState(31);
  function seedSeven(){for(const item of words.slice(0,7)) stage.record(item.id,result(item.kind,item.text));}
  function lowEighth(){stage.record(words[7].id,result('word',words[7].text,79));}
  async function assess(kind:SpeechKind,text:string,audio:Blob){if(!audio.size)throw new Error('empty test audio');setCalls(n=>n+1);return result(kind,text,score);}
  async function loadAudio(){
    const response=await fetch('/samples/ft-word-box.wav');
    const input=document.querySelector<HTMLInputElement>('input[type=file]');
    if(!input)return;
    const transfer=new DataTransfer();
    transfer.items.add(new File([await response.blob()],'synthetic-example.wav',{type:'audio/wav'}));
    input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  }
  return <main style={{maxWidth:1100,margin:'auto',padding:24}}>
    <aside className="qa-controls" aria-label="合成测试控制台">
      <strong>合成成绩测试 · 独立测试账号 · 未调用评分供应商</strong>
      <div><button onClick={()=>setScore(31)}>后续返回31分</button><button onClick={()=>setScore(85)}>后续返回85分</button><button onClick={seedSeven}>前7题录入80分</button><button onClick={lowEighth}>第8题录入79分</button><button onClick={loadAudio}>装入合成测试音频</button><button onClick={()=>{localStorage.removeItem(key);window.location.hash='words';window.location.reload();}}>重置独立测试</button></div>
      <output>已通过 {stage.status.word.passed}/104 · 本次模拟提交 {calls} 次</output>
    </aside>
    <SpeechSuperPanel stage={stage} assess={assess} checkStatus={false}/>
  </main>;
}
createRoot(document.getElementById('root')!).render(<LanguageProvider><style>{`*{box-sizing:border-box}body{margin:0;background:#f6f9ff;color:#102a50;font-family:Nunito,"PingFang SC",sans-serif}button{font-family:inherit}.qa-controls{background:#fff1be;padding:14px 18px;border-radius:12px;margin-bottom:18px;font-size:13px}.qa-controls strong,.qa-controls output{display:block}.qa-controls div{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.qa-controls button{border:1px solid #d6c173;border-radius:6px;background:white;padding:6px 10px;cursor:pointer}`}</style><Harness/></LanguageProvider>);
