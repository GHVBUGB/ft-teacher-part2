import { calculateScore, type CalculatedScore } from './score';

/** Local rehearsal progress. A server must enforce these rules before production use. */
export type StageContext = {
  teacherId: string;
  enrollmentId: string;
  contentVersion: string;
};
export type StageItem = { id: string; text: string; kind: 'word' | 'sentence' };
export type StageAttemptInput = {
  attemptId: string;
  itemId: string;
  text: string;
  kind: string;
  metrics: Record<string, unknown>;
  createdAt: string;
  status?: 'scored' | 'error' | 'invalid';
};
export type StageAttempt = Omit<
  StageAttemptInput,
  'kind' | 'metrics' | 'status'
> & {
  kind: StageItem['kind'];
  metrics: Record<string, number>;
  status: 'scored';
  score: number;
  rule: CalculatedScore['rule'];
};
export type StageProgress = {
  schemaVersion: 1;
  context: StageContext;
  catalogSignature: string;
  attempts: StageAttempt[];
};
export type ItemStageStatus = {
  passed: boolean;
  bestScore: number | null;
  lastScore: number | null;
  attemptCount: number;
};
export type StageStatus = {
  word: { total: number; passed: number; complete: boolean; unlocked: boolean };
  sentence: {
    total: number;
    passed: number;
    complete: boolean;
    unlocked: boolean;
  };
  items: Record<string, ItemStageStatus>;
  pronunciationComplete: boolean;
  configurationValid: boolean;
};
export const STAGE_PASS_SCORE = 80;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function validContext(context: unknown): context is StageContext {
  return (
    isRecord(context) &&
    nonempty(context.teacherId) &&
    nonempty(context.enrollmentId) &&
    nonempty(context.contentVersion)
  );
}
function catalog(items: readonly StageItem[]): Map<string, StageItem> | null {
  const result = new Map<string, StageItem>();
  for (const item of items) {
    if (
      !item ||
      !nonempty(item.id) ||
      !nonempty(item.text) ||
      !['word', 'sentence'].includes(item.kind) ||
      result.has(item.id)
    )
      return null;
    result.set(item.id, item);
  }
  return result;
}
function signature(items: readonly StageItem[]): string {
  if (!catalog(items)) return '';
  return JSON.stringify(
    items
      .map(({ id, text, kind }) => ({ id, text, kind }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
}
function sameContext(a: unknown, b: StageContext): boolean {
  return (
    validContext(a) &&
    validContext(b) &&
    a.teacherId === b.teacherId &&
    a.enrollmentId === b.enrollmentId &&
    a.contentVersion === b.contentVersion
  );
}
/** Only normalized dimension values are retained. Provider total and saved pass flags never enter the calculation. */
function normalizeMetrics(
  input: Record<string, unknown>,
): Record<string, number> {
  const metrics: Record<string, number> = {};
  for (const field of [
    'pronunciation',
    'fluency',
    'rhythm',
    'integrity',
    'intelligibility',
    'stress',
  ]) {
    const value = input[field];
    if (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 100
    )
      metrics[field] = value;
  }
  const speed = input.speed;
  if (typeof speed === 'number' && Number.isFinite(speed) && speed >= 0)
    metrics.speed = speed;
  return metrics;
}
function allPassed(
  kind: StageItem['kind'],
  known: Map<string, StageItem>,
  passed: Set<string>,
): boolean {
  const stage = [...known.values()].filter((item) => item.kind === kind);
  return stage.length > 0 && stage.every((item) => passed.has(item.id));
}
function normalizeAttempt(
  input: unknown,
  known: Map<string, StageItem>,
): StageAttempt | null {
  if (
    !isRecord(input) ||
    !nonempty(input.attemptId) ||
    !nonempty(input.itemId) ||
    !nonempty(input.createdAt) ||
    !Number.isFinite(Date.parse(input.createdAt)) ||
    !isRecord(input.metrics)
  )
    return null;
  if (input.status !== undefined && input.status !== 'scored') return null;
  const item = known.get(input.itemId);
  if (!item || input.kind !== item.kind || input.text !== item.text)
    return null;
  const metrics = normalizeMetrics(input.metrics);
  const calculated = calculateScore(item.kind, metrics);
  if (calculated.value === null) return null;
  return {
    attemptId: input.attemptId,
    itemId: item.id,
    text: item.text,
    kind: item.kind,
    metrics,
    createdAt: new Date(input.createdAt).toISOString(),
    status: 'scored',
    score: calculated.value,
    rule: calculated.rule,
  };
}

export function createStageProgress(
  context: StageContext,
  items: readonly StageItem[],
): StageProgress {
  return {
    schemaVersion: 1,
    context: { ...context },
    catalogSignature: signature(items),
    attempts: [],
  };
}

/** Rebuild in recording order; a previously locked sentence cannot become valid retroactively. */
export function restoreStageProgress(
  raw: unknown,
  context: StageContext,
  items: readonly StageItem[],
  allowUnordered = false,
): StageProgress {
  const state = createStageProgress(context, items);
  const known = catalog(items);
  if (!known || !validContext(context)) return state;
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return state;
    }
  }
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !sameContext(value.context, context) ||
    value.catalogSignature !== state.catalogSignature ||
    !Array.isArray(value.attempts)
  )
    return state;
  const seen = new Set<string>();
  const passed = new Set<string>();
  // Keep original order for equal timestamps. Scores/rules/pass flags in storage are ignored.
  const candidates = value.attempts
    .filter((entry: unknown) => isRecord(entry) && entry.status === 'scored')
    .map((entry: unknown) => normalizeAttempt(entry, known))
    .filter((entry): entry is StageAttempt => entry !== null)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  for (const attempt of candidates) {
    if (seen.has(attempt.attemptId)) continue;
    seen.add(attempt.attemptId);
    if (
      !allowUnordered &&
      attempt.kind === 'sentence' &&
      !allPassed('word', known, passed)
    )
      continue;
    state.attempts.push(attempt);
    if (attempt.score >= STAGE_PASS_SCORE) passed.add(attempt.itemId);
  }
  return state;
}

export type AddStageAttemptResult = {
  state: StageProgress;
  accepted: boolean;
  reason:
    | 'accepted'
    | 'invalid_context'
    | 'invalid_catalog'
    | 'invalid_attempt'
    | 'duplicate'
    | 'stage_locked'
    | 'out_of_order';
};
export function addStageAttempt(
  state: StageProgress,
  context: StageContext,
  items: readonly StageItem[],
  input: StageAttemptInput,
  allowUnordered = false,
): AddStageAttemptResult {
  const next = restoreStageProgress(state, context, items, allowUnordered);
  const reject = (
    reason: AddStageAttemptResult['reason'],
  ): AddStageAttemptResult => ({ state: next, accepted: false, reason });
  if (!validContext(context)) return reject('invalid_context');
  const known = catalog(items);
  if (!known) return reject('invalid_catalog');
  const attempt = normalizeAttempt(input, known);
  if (!attempt) return reject('invalid_attempt');
  if (
    next.attempts.some((previous) => previous.attemptId === attempt.attemptId)
  )
    return reject('duplicate');
  const latest = next.attempts.at(-1);
  if (latest && Date.parse(attempt.createdAt) < Date.parse(latest.createdAt))
    return reject('out_of_order');
  const passed = new Set(
    next.attempts
      .filter((previous) => previous.score >= STAGE_PASS_SCORE)
      .map((previous) => previous.itemId),
  );
  if (
    !allowUnordered &&
    attempt.kind === 'sentence' &&
    !allPassed('word', known, passed)
  )
    return reject('stage_locked');
  return {
    state: { ...next, attempts: [...next.attempts, attempt] },
    accepted: true,
    reason: 'accepted',
  };
}

export function getStageStatus(
  state: StageProgress,
  items: readonly StageItem[],
  allowUnordered = false,
): StageStatus {
  const known = catalog(items);
  const result: StageStatus = {
    word: { total: 0, passed: 0, complete: false, unlocked: true },
    sentence: { total: 0, passed: 0, complete: false, unlocked: false },
    items: Object.create(null) as Record<string, ItemStageStatus>,
    pronunciationComplete: false,
    configurationValid: !!known && validContext(state.context),
  };
  if (!known || !result.configurationValid) return result;
  for (const item of known.values()) {
    result[item.kind].total += 1;
    result.items[item.id] = {
      passed: false,
      bestScore: null,
      lastScore: null,
      attemptCount: 0,
    };
  }
  const restored = restoreStageProgress(
    state,
    state.context,
    items,
    allowUnordered,
  );
  for (const attempt of restored.attempts) {
    const itemStatus = result.items[attempt.itemId];
    itemStatus.attemptCount += 1;
    itemStatus.lastScore = attempt.score;
    itemStatus.bestScore = Math.max(itemStatus.bestScore ?? 0, attempt.score);
    itemStatus.passed ||= attempt.score >= STAGE_PASS_SCORE;
  }
  for (const item of known.values())
    if (result.items[item.id].passed) result[item.kind].passed += 1;
  result.word.complete =
    result.word.total > 0 && result.word.passed === result.word.total;
  result.sentence.unlocked = allowUnordered || result.word.complete;
  result.sentence.complete =
    result.sentence.unlocked &&
    result.sentence.total > 0 &&
    result.sentence.passed === result.sentence.total;
  result.pronunciationComplete =
    result.word.complete && result.sentence.complete;
  return result;
}
