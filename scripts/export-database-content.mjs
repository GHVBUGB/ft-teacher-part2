import fs from 'node:fs';
import ts from 'typescript';
import { createHash } from 'node:crypto';
const source = fs.readFileSync('src/features/practice/lib/catalog.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { words, grammar, CONTENT_VERSION } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const version = CONTENT_VERSION + '-grammar-20260920';
const q = value => "'" + String(value).replaceAll("'", "''") + "'";
const counts = { word: words.filter(x=>x.kind==='关键词').length, sentence: words.filter(x=>x.kind!=='关键词').length, grammar: grammar.length };
if (counts.word !== 41 || counts.sentence !== 58 || counts.grammar !== 30 || new Set([...words,...grammar].map(x=>x.id)).size !== 129) throw Error('Unexpected catalog');
const rules = [
 ['word',30,80, {score_formula:'pronunciation',rounding_decimal_places:1,all_items_must_pass:true,retry_failed_item:true,prerequisite:null},'第一关：随机抽30个单词；发音分四舍五入到1位小数，每题至少80分，全部通过后解锁第二关。'],
 ['sentence',20,80,{score_formula:'(pronunciation*0.85+fluency*0.10+rhythm*0.05)*integrity/100',rounding_decimal_places:1,all_items_must_pass:true,retry_failed_item:true,prerequisite:'word'},'第二关：随机抽20个句子；（发音×85%＋流利度×10%＋韵律×5%）×完整度/100，四舍五入到1位小数，每题至少80分，全部通过后解锁第三关。'],
 ['grammar',30,80,{required_correct:24,max_wrong:6,fail_on_wrong_number:7,attempts_per_question:1,sequential:true,wrong_answer_reveals_solution:false,wrong_answer_can_continue:true,shuffle_on_failed_reentry:true,resume_unfinished:true,prerequisite:'sentence'},'第三关：30题，每题只提交一次，按顺序作答，答错标记错误且不揭示答案。完成后至少答对24题通过；累计错7题立即结束，重考打乱顺序。未完成时保留进度。']
];
let sql = `BEGIN;
CREATE TABLE ft_training.content_versions(version text PRIMARY KEY, source_description text NOT NULL, source_sha256 text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE ft_training.speech_questions(content_version text NOT NULL REFERENCES ft_training.content_versions(version), id text NOT NULL, kind text NOT NULL CHECK(kind IN ('word','sentence')), text text NOT NULL, metadata jsonb NOT NULL, PRIMARY KEY(content_version,id));
CREATE TABLE ft_training.assessment_rules(content_version text NOT NULL REFERENCES ft_training.content_versions(version), stage text NOT NULL CHECK(stage IN ('word','sentence','grammar')), question_count integer NOT NULL CHECK(question_count>0), pass_percent integer NOT NULL CHECK(pass_percent BETWEEN 0 AND 100), settings jsonb NOT NULL, description_zh text NOT NULL, PRIMARY KEY(content_version,stage));
COMMENT ON TABLE ft_training.speech_questions IS '第一关单词与第二关句子题库；按版本保存';
COMMENT ON TABLE ft_training.grammar_questions IS '第三关语法题、两个选项、正确选项与原始解析';
COMMENT ON TABLE ft_training.assessment_rules IS '三关抽题、评分、通过、解锁与重考规则；保存配置不等于应用已接入';
INSERT INTO ft_training.content_versions VALUES(${q(version)},'FT Target Words V2.xlsx + FT Questions.xlsx；当前项目题库快照',${q(createHash('sha256').update(source).digest('hex'))},now());
`;
sql += 'INSERT INTO ft_training.speech_questions VALUES\n' + words.map(({id,text,kind,...metadata})=>'('+[version,id,kind==='关键词'?'word':'sentence',text,JSON.stringify(metadata)].map(q).join(',')+')').join(',\n')+';\n';
sql += 'INSERT INTO ft_training.grammar_questions VALUES\n' + grammar.map(g=>{const v=g.variants[0]; if(g.variants.length!==1 || v.options.length!==2 || ![0,1].includes(v.answer)) throw Error('Invalid grammar'); return '('+[version,g.id,v.prompt,...v.options,v.answer,v.explanation].map(q).join(',')+')';}).join(',\n')+';\n';
sql += 'INSERT INTO ft_training.assessment_rules VALUES\n' + rules.map(([stage,count,percent,settings,description])=>'('+[version,stage,count,percent,JSON.stringify(settings),description].map(q).join(',')+')').join(',\n')+';\n';
sql += `INSERT INTO ft_training.schema_versions VALUES(2,now());\nCOMMIT;\n`;
fs.writeFileSync('server/production/migrations/002_content_and_rules.sql',sql);
fs.writeFileSync('docs/production/content-import.json', JSON.stringify({version,counts,rules,source_sha256:createHash('sha256').update(source).digest('hex')},null,2)+'\n');
console.log(JSON.stringify({version,counts,ruleCount:rules.length,sqlBytes:Buffer.byteLength(sql)}));
