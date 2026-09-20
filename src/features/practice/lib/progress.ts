import { words, grammar, CONTENT_VERSION } from './catalog';
export type Attempt = {
  id: string;
  itemId: string;
  at: string;
  source: 'microphone' | 'sample';
  scenario: string;
  score: number | null;
  passed: boolean;
  status: 'scored' | 'invalid' | 'error';
  duration: number;
  human: 'not_reviewed';
};
export type GrammarAttempt = {
  id: string;
  topic: string;
  variant: number;
  selected: number;
  correct: boolean;
  at: string;
};
export type Progress = {
  version: string;
  teacherId: string;
  enrollmentId: string;
  attempts: Attempt[];
  grammarAttempts: GrammarAttempt[];
  grammarOrder?: number[];
  grammarHistory?: GrammarAttempt[][];
  variants: Record<string, number>;
  selectedWord: number;
  selectedTopic: number;
  updatedAt: string;
};
export const STORAGE_KEY = 'ft-practice:demo:v1';
export const freshProgress = (): Progress => ({
  version: CONTENT_VERSION,
  teacherId: 'DEMO-TEACHER-001',
  enrollmentId: 'DEMO-FT-2026-001',
  attempts: [],
  grammarAttempts: [],
  variants: {},
  selectedWord: 0,
  selectedTopic: 0,
  updatedAt: '',
});
export function wordPassed(p: Progress, id: string) {
  return p.attempts.some(
    (a) => a.itemId === id && a.status === 'scored' && a.passed,
  );
}
export function topicPassed(p: Progress, id: string) {
  return p.grammarAttempts.some((a) => a.topic === id && a.correct);
}
export function grammarResult(p: Progress) {
  const answers = grammar.map(g => p.grammarAttempts.find(a => a.topic === g.id));
  const answered = answers.filter(Boolean).length;
  const correct = answers.filter(a => a?.correct).length;
  const wrong = answered - correct;
  const failedEarly = wrong > grammar.length - Math.ceil(grammar.length * 0.8);
  return { answered, correct, wrong, failedEarly, finished: answered === grammar.length || failedEarly,
    passed: answered === grammar.length && correct >= Math.ceil(grammar.length * 0.8) };
}
export function restartGrammar(p: Progress): Progress {
  const order = grammar.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const previous = p.grammarOrder ?? grammar.map((_, i) => i);
  if (order.every((n, i) => n === previous[i])) order.push(order.shift()!);
  return { ...p, grammarOrder: order, selectedTopic: order[0], variants: {},
    grammarHistory: [...(p.grammarHistory ?? []), ...(p.grammarAttempts.length ? [p.grammarAttempts] : [])],
    grammarAttempts: [] };
}
export function completion(p: Progress) {
  const pronunciation = words.filter((w) => wordPassed(p, w.id)).length;
  const g = grammar.filter((g) => topicPassed(p, g.id)).length;
  return {
    pronunciation,
    grammar: g,
    total: words.length + grammar.length,
    done: pronunciation + g,
    ready: pronunciation === words.length && grammarResult(p).passed,
  };
}
export function parseProgress(raw: string | null): Progress {
  if (!raw) return freshProgress();
  try {
    const p = JSON.parse(raw);
    if (
      !p ||
      p.version !== CONTENT_VERSION ||
      !Array.isArray(p.attempts) ||
      !Array.isArray(p.grammarAttempts)
    )
      return freshProgress();
    const variants = Object.fromEntries(
      grammar.map((g) => {
        const value = p.variants?.[g.id];
        return [
          g.id,
          Number.isInteger(value) && value >= 0 ? value % g.variants.length : 0,
        ];
      }),
    );
    return {
      ...freshProgress(),
      ...p,
      selectedWord:
        Number.isInteger(p.selectedWord) &&
        p.selectedWord >= 0 &&
        p.selectedWord < words.length
          ? p.selectedWord
          : 0,
      selectedTopic:
        Number.isInteger(p.selectedTopic) &&
        p.selectedTopic >= 0 &&
        p.selectedTopic < grammar.length
          ? p.selectedTopic
          : 0,
      attempts: p.attempts.filter(
        (a: Attempt) =>
          a &&
          words.some((w) => w.id === a.itemId) &&
          ['scored', 'invalid', 'error'].includes(a.status) &&
          typeof a.passed === 'boolean' &&
          Number.isFinite(a.duration),
      ),
      grammarAttempts: p.grammarAttempts.filter(
        (a: GrammarAttempt) =>
          a &&
          grammar.some((g) => g.id === a.topic) &&
          typeof a.correct === 'boolean',
      ),
      grammarOrder: Array.isArray(p.grammarOrder) && p.grammarOrder.length === grammar.length && new Set(p.grammarOrder).size === grammar.length && p.grammarOrder.every((n: number) => Number.isInteger(n) && n >= 0 && n < grammar.length) ? p.grammarOrder : grammar.map((_, i) => i),
      grammarHistory: Array.isArray(p.grammarHistory) ? p.grammarHistory : [],
      variants,
    };
  } catch {
    return freshProgress();
  }
}
export function demoScore(scenario: string, duration: number, rms: number) {
  if (duration < 0.7 || rms < 0.004)
    return { status: 'invalid' as const, score: null, passed: false };
  if (scenario === 'error')
    return { status: 'error' as const, score: null, passed: false };
  const score = scenario === 'retry' ? 62 : 92;
  return { status: 'scored' as const, score, passed: score >= 80 };
}
