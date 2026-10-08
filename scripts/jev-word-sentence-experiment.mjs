import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { askJev } from "/Users/guhongji/Desktop/hermes/services/dingtalk-codex/src/jev-decision.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, "..");
const CONTENT_FILE = path.join(PROJECT_ROOT, "docs/content/ft-target-words-v2.json");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "docs/research/jev-word-sentence-experiment-2026-09-21");

const cases = [
  ["ft-word-yellow", "yellow", "yellow", "exact"],
  ["ft-word-brown", "brown", "brow", "near"],
  ["ft-word-green", "green", "blue", "wrong"],
  ["ft-word-ant", "ant", "[无识别文本]", "unclear"],
  ["ft-word-candy", "candy", "candy", "exact"],
  ["ft-word-happy", "happy", "hapy", "near"],
  ["ft-word-angry", "angry", "apple", "wrong"],
  ["ft-word-bear", "bear", "bear", "exact"],
  ["ft-word-camel", "camel", "camal", "near"],
  ["ft-word-boots", "boots", "boots", "exact"],
  ["ft-sentence-f815800771b8", "It's a yellow cake.", "It's a yellow cake.", "exact"],
  ["ft-sentence-8f3f08bcd30a", "It's a brown cake.", "It's a brown cake", "exact"],
  ["ft-sentence-e6a0d0eda900", "I feel happy.", "I feel sad.", "wrong"],
  ["ft-sentence-3fc8c65caddf", "I feel sad.", "[无识别文本]", "unclear"],
  ["ft-sentence-1e695bb7dc6a", "It's blue.", "Its blue.", "near"],
  ["ft-sentence-d15e60c3590c", "I will play basketball.", "I will play basketbal.", "near"],
  ["ft-sentence-e4149cf61ce8", "I'm wearing sneakers.", "I'm wearing a shirt.", "wrong"],
  ["ft-sentence-9843d164f918", "I like pandas.", "I like pandas.", "exact"],
  ["ft-sentence-21dd9d0b218b", "Let's try rock climbing.", "Let's try climbing.", "near"],
  ["ft-sentence-504400974f6f", "I see a circle.", "I see a square.", "wrong"],
].map(([id, target, observed, gold]) => ({ id, target, observed, gold }));

const labels = {
  exact: "与目标文本一致（忽略大小写和末尾标点）",
  near: "轻微识别误差，但核心词或句意仍基本对应",
  wrong: "与目标不对应，不能判为通过",
  unclear: "没有可用识别文本，应该交给复核或重试",
};

function normalize(value) {
  return String(value ?? "").toLowerCase().replace(/[.'?,!]/g, "").replace(/\s+/g, " ").trim();
}

function wordSet(value) {
  return new Set(normalize(value).split(" ").filter(Boolean));
}

function baseline(item) {
  const observed = normalize(item.observed);
  const target = normalize(item.target);
  if (!observed || observed.includes("无识别文本")) return "unclear";
  if (observed === target) return "exact";
  const targetTokens = wordSet(target);
  const observedTokens = wordSet(observed);
  const overlap = [...targetTokens].filter((x) => observedTokens.has(x)).length / Math.max(targetTokens.size, 1);
  if (overlap >= 0.75 || (target.length >= 4 && observed.length >= 3 && Math.abs(target.length - observed.length) <= 1)) return "near";
  return "wrong";
}

function questionFor(item) {
  return {
    type: "choice",
    instructions: [
      `这是 FT 英语${item.id.startsWith("ft-word-") ? "单词" : "句子"}文本判断。目标文本是“${item.target}”，语音识别结果是“${item.observed}”。`,
      "只按这四个标签判断，不评估发音音质，不猜测没有提供的声音：exact=文本一致，near=轻微识别误差但核心仍对应，wrong=不对应，unclear=没有可用识别文本。",
      "请给出最符合的标签，并保持概率分布和置信度诚实。",
    ].join(" "),
    criteria: labels,
  };
}

const content = JSON.parse(await fs.readFile(CONTENT_FILE, "utf8"));
const catalogIds = new Set(content.items.map((item) => item.id));
const missing = cases.filter((item) => !catalogIds.has(item.id));
if (missing.length) throw new Error(`sample_not_in_ft_catalog:${missing.map((x) => x.id).join(",")}`);

const questions = Object.fromEntries(cases.map((item, index) => [`case_${String(index + 1).padStart(2, "0")}`, questionFor(item)]));
const state = {
  project: "ft-teacher-part2",
  experiment: "word_sentence_text_judgment",
  warning: "这是脱敏、合成的文本重放样本；不读取教师身份、录音内容或业务账号，也不修改 FT 评分链路。",
  cases: cases.map(({ id, target, observed }) => ({ id, target, observed })),
};

const result = await askJev({ state, questions, dryRun: false });
const answers = result.answers || {};
const rows = cases.map((item, index) => {
  const key = `case_${String(index + 1).padStart(2, "0")}`;
  const answer = answers[key] || null;
  const jevLabel = answer?.choice || null;
  return {
    case: key,
    id: item.id,
    target: item.target,
    observed: item.observed,
    gold: item.gold,
    baseline: baseline(item),
    jev: jevLabel,
    baselineCorrect: baseline(item) === item.gold,
    jevCorrect: jevLabel === item.gold,
    jevConfidence: answer?.confidence ?? null,
    jevProbabilities: answer?.probabilities ?? null,
  };
});

const countCorrect = (key) => rows.filter((row) => row[key]).length;
const summary = {
  status: result.status,
  provider: result.provider || null,
  model: result.model || null,
  latencyMs: result.latencyMs || null,
  usage: result.usage || null,
  sampleCount: rows.length,
  wordCount: rows.filter((row) => row.id.startsWith("ft-word-")).length,
  sentenceCount: rows.filter((row) => row.id.startsWith("ft-sentence-")).length,
  baselineCorrect: countCorrect("baselineCorrect"),
  jevCorrect: countCorrect("jevCorrect"),
  baselineAccuracy: countCorrect("baselineCorrect") / rows.length,
  jevAccuracy: countCorrect("jevCorrect") / rows.length,
  interpretation: "文本重放实验，不等于发音评分准确率，不改变 FT 业务评分或生产验收结论。",
};

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.writeFile(path.join(OUTPUT_DIR, "results.json"), JSON.stringify({ summary, rows }, null, 2) + "\n");
await fs.writeFile(path.join(OUTPUT_DIR, "input.json"), JSON.stringify({ state, questions, labels }, null, 2) + "\n");
const report = `# FT 单词与句子 Jev 对比实验\n\n日期：2026-09-21\n\n## 实验目的\n\n用 FT 当前题库中的 10 个单词和 10 个句子，构造正确、轻微识别误差、错误、无法识别四类文本样本，对比现有确定性规则基线与 Jev 的结构化判断。\n\n## 重要边界\n\n- 这是文本重放实验，不是录音发音质量实验。\n- 没有读取教师身份、录音内容或业务账号。\n- 没有修改 FT 的题库、评分公式、接口、保存和解锁规则。\n- gold 标签是本次实验预先写好的人工判定，不等于真实业务验收。\n\n## 结果\n\n- Jev 状态：${summary.status}\n- 模型：${summary.model || "无"}\n- 本次延迟：${summary.latencyMs ?? "无"} ms\n- 样本：${summary.sampleCount} 条（单词 ${summary.wordCount}，句子 ${summary.sentenceCount}）\n- 规则基线：${summary.baselineCorrect}/${summary.sampleCount}（${(summary.baselineAccuracy * 100).toFixed(1)}%）\n- Jev：${summary.jevCorrect}/${summary.sampleCount}（${(summary.jevAccuracy * 100).toFixed(1)}%）\n\n## 如何解释\n\n这个实验只能说明 Jev 是否能在同一份 FT 文本样本上返回合法的结构化标签，以及和一个非常简单的规则基线有何差异。它不能证明发音评分更准，也不能直接改变 FT 的通过门槛。下一步必须使用真实脱敏转写和人工标注，至少 20 条，分别统计准确率、人工介入、一次通过率、延迟和成本。\n\n完整逐条结果见同目录的 results.json，本次请求输入见 input.json。\n`;
await fs.writeFile(path.join(OUTPUT_DIR, "REPORT.md"), report);
console.log(JSON.stringify({ summary, outputDir: OUTPUT_DIR }, null, 2));
