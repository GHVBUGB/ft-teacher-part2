/** Product scoring rule v1. Input dimensions are on a 0–100 scale. */
export type CalculatedScore = { value: number | null; rule: 'word-v1' | 'sentence-v1' | 'unsupported'; missing: string[] };
export function calculateScore(kind: string, metrics: Record<string, unknown>): CalculatedScore {
  if (kind !== 'word' && kind !== 'sentence') return { value: null, rule: 'unsupported', missing: ['unsupported kind'] };
  const rule = kind === 'word' ? 'word-v1' : 'sentence-v1';
  const fields = kind === 'word' ? ['pronunciation'] : ['pronunciation', 'fluency', 'rhythm', 'integrity'];
  const missing = fields.filter(k => typeof metrics[k] !== 'number' || !Number.isFinite(metrics[k]) || Number(metrics[k]) < 0 || Number(metrics[k]) > 100);
  if (missing.length) return { value: null, rule, missing };
  const score = kind === 'word' ? Number(metrics.pronunciation) : (Number(metrics.pronunciation) * .85 + Number(metrics.fluency) * .10 + Number(metrics.rhythm) * .05) * Number(metrics.integrity) / 100;
  return { value: Math.round((score + Number.EPSILON) * 10) / 10, rule, missing: [] };
}
