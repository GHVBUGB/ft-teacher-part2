import { createRoot } from 'react-dom/client';
import { useEffect } from 'react';
import { LanguageProvider } from '../src/shared/i18n';
import { useStageTraining } from '../src/features/practice/useStageTraining';
import { stageItems } from '../src/features/practice/lib/stageCatalog';
import { CONTENT_VERSION } from '../src/features/practice/lib/catalog';
import SpeechSuperPanel from '../src/features/practice/SpeechSuperPanel';
import type { SpeechResult } from '../src/features/practice/lib/speechsuper';
import '../src/shared/ui/theme.css';
import '../src/features/practice/ReadingFlow.css';
import '@fontsource/nunito/800.css';
function Harness(){
 const stage=useStageTraining({teacherId:'SYNTHETIC-RANDOM-ROUND',enrollmentId:'SYNTHETIC-RANDOM-ROUND',contentVersion:CONTENT_VERSION},stageItems,'round-qa');
 useEffect(()=>{stage.start();},[stage.start]);
 const id=location.hash.startsWith('#read/')?location.hash.slice(6):stage.items[0]?.id;
 const recordItem=(item: typeof stageItems[number], score:number)=>{stage.record(item.id,{id:crypto.randomUUID(),kind:item.kind,text:item.text,result:{pronunciation:score,fluency:score,rhythm:score,integrity:100},duration:1,scale:"0-100",qualification:"Synthetic",provider:"synthetic"} as SpeechResult);};
 const record=(score:number)=>{const selected=location.hash.startsWith('#read/')?location.hash.slice(6):id;const item=stage.items.find(i=>i.id===selected);if(!item)return;stage.record(item.id,{id:crypto.randomUUID(),kind:item.kind,text:item.text,result:{pronunciation:score,fluency:score,rhythm:score,integrity:100},duration:1,scale:'0-100',qualification:'Synthetic',provider:'synthetic'} as SpeechResult);};
 return <><div style={{background:'#fff1c7',padding:8,fontSize:12}}>独立合成账号 · 不调用供应商，不影响用户成绩 <button onClick={()=>record(50)}>模拟当前题50分</button><button onClick={()=>record(90)}>模拟当前题90分</button><button onClick={()=>stage.items.filter(i=>i.kind==='word'&&!stage.status.items[i.id]?.passed).forEach(i=>recordItem(i,90))}>模拟完成30词</button><button onClick={()=>stage.items.filter(i=>i.kind==='sentence').forEach(i=>recordItem(i,90))}>模拟完成20句</button></div><p style={{margin:4,fontSize:12}}>本轮：{stage.items.filter(i=>i.kind==='word').length}词 / {stage.items.filter(i=>i.kind==='sentence').length}句；通过：{stage.status.word.passed}；句子解锁：{String(stage.status.sentence.unlocked)}；句子通过：{stage.status.sentence.passed}/{stage.status.sentence.total}；全部发音通过：{String(stage.status.pronunciationComplete)}</p><SpeechSuperPanel stage={stage} checkStatus={false}/></>;
}
createRoot(document.getElementById('root')!).render(<LanguageProvider><Harness/></LanguageProvider>);
