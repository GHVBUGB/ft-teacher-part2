import type { StageItem, StageStatus } from './stageProgress';
export const ROUND_SIZE = { word: 30, sentence: 20 } as const;
export type AssessmentRound = { version: 1; ids: string[]; seen: string[] };
export function sample<T>(values: readonly T[], count: number, random = Math.random): T[] {
  const shuffled = [...values];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}
export function createRound(bank: readonly StageItem[], random = Math.random): AssessmentRound {
  const ids = (['word', 'sentence'] as const).flatMap(kind => {
    const pool = bank.filter(i => i.kind === kind);
    if (pool.length < ROUND_SIZE[kind]) throw new Error('题库数量不足，无法开始考核。');
    return sample(pool, ROUND_SIZE[kind], random).map(i => i.id);
  });
  return { version: 1, ids, seen: [...ids] };
}
export function restoreRound(value: unknown, bank: readonly StageItem[]): AssessmentRound | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as AssessmentRound;
  if (r.version !== 1 || !Array.isArray(r.ids) || !Array.isArray(r.seen)) return null;
  const known = new Map(bank.map(i => [i.id, i]));
  if (r.ids.length !== 50 || new Set(r.ids).size !== 50 || new Set(r.seen).size !== r.seen.length) return null;
  if (![...r.ids, ...r.seen].every(id => typeof id === 'string' && known.has(id))) return null;
  if (!r.ids.every(id => r.seen.includes(id))) return null;
  if (r.ids.slice(0, 30).some(id => known.get(id)?.kind !== 'word') || r.ids.slice(30).some(id => known.get(id)?.kind !== 'sentence')) return null;
  return { version: 1, ids: [...r.ids], seen: [...r.seen] };
}
export function replacementFor(round: AssessmentRound, bank: readonly StageItem[], status: StageStatus, id: string, random = Math.random): string | null {
  const item = bank.find(i => i.id === id);
  const previous = status.items[id];
  if (!item || !round.ids.includes(id) || previous?.passed || !previous?.attemptCount) return null;
  const pool = bank.filter(i => i.kind === item.kind && !round.ids.includes(i.id) && !status.items[i.id]?.passed);
  const unseen = pool.filter(i => !round.seen.includes(i.id));
  return sample(unseen.length ? unseen : pool, 1, random)[0]?.id ?? null;
}
export function replaceRound(round: AssessmentRound, oldId: string, newId: string): AssessmentRound {
  return { ...round, ids: round.ids.map(id => id === oldId ? newId : id), seen: [...new Set([...round.seen, newId])] };
}
