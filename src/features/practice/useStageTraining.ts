import { isOpenPreview } from './lib/previewMode';
import { useMemo, useSyncExternalStore } from 'react';
import { createStageProgress, restoreStageProgress, addStageAttempt, getStageStatus, type StageContext, type StageItem } from './lib/stageProgress';
import { createRound, restoreRound, replacementFor, replaceRound, ROUND_SIZE, type AssessmentRound } from './lib/assessmentRound';
import type { SpeechResult } from './lib/speechsuper';

function createStore(context: StageContext, bank: readonly StageItem[], key: string, allowUnordered: boolean) {
  let snapshot = { progress: createStageProgress(context, bank), round: null as AssessmentRound | null, error: '' };
  const serverSnapshot = snapshot;
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    snapshot = { progress: restoreStageProgress(parsed, context, bank, true), round: restoreRound(parsed?.round, bank), error: '' };
  } catch { snapshot.error = '无法读取本地成绩。此次练习只能在当前页面保留。'; }
  const listeners = new Set<() => void>();
  const selectedItems = () => snapshot.round?.ids.map(id => bank.find(i => i.id === id)!).filter(Boolean) ?? [];
  const currentStatus = () => {
    const items = selectedItems();
    const selected = new Set(items.map(i => i.id));
    // Restore against the full bank; evaluate completion against this round only.
    const state = { ...createStageProgress(context, items), attempts: snapshot.progress.attempts.filter(a => selected.has(a.itemId)) };
    const status = getStageStatus(state, items, true);
    status.sentence.unlocked = allowUnordered || status.word.complete;
    return status;
  };
  const save = (next: typeof snapshot) => {
    try { localStorage.setItem(key, JSON.stringify({ ...next.progress, round: next.round })); }
    catch { next = { ...next, error: '本地保存失败，请保持页面打开。' }; }
    snapshot = next;
    listeners.forEach(fn => fn());
  };
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    status: currentStatus,
    start: () => {
      if (snapshot.round) return;
      try { save({ ...snapshot, round: createRound(bank) }); }
      catch (e) { snapshot = { ...snapshot, error: (e as Error).message }; listeners.forEach(fn => fn()); }
    },
    record: (itemId: string, result: SpeechResult) => {
      const item = selectedItems().find(i => i.id === itemId);
      if (!item || (item.kind === 'sentence' && !currentStatus().sentence.unlocked)) return;
      const next = addStageAttempt(snapshot.progress, context, bank, { attemptId: result.id, itemId, text: result.text, kind: result.kind, metrics: result.metrics ?? result.result, createdAt: new Date().toISOString() }, true);
      if (next.accepted) save({ ...snapshot, progress: next.state, error: '' });
    },
    canReplace: (id: string) => snapshot.round ? Boolean(replacementFor(snapshot.round, bank, getStageStatus(snapshot.progress, bank, true), id, () => 0)) : false,
    replace: (id: string) => {
      if (!snapshot.round) return null;
      const next = replacementFor(snapshot.round, bank, getStageStatus(snapshot.progress, bank, true), id);
      if (!next) return null;
      save({ ...snapshot, round: replaceRound(snapshot.round, id, next), error: '' });
      return next;
    },
  };
}

export function useStageTraining(context: StageContext, bank: readonly StageItem[], storageScope = '') {
  const { teacherId, enrollmentId, contentVersion } = context;
  const allowUnordered = storageScope === 'acceptance' && isOpenPreview();
  const store = useMemo(() => createStore({ teacherId, enrollmentId, contentVersion }, bank, `ft-practice:stages:v1:${teacherId}:${enrollmentId}:${contentVersion}:${storageScope}`, allowUnordered), [teacherId, enrollmentId, contentVersion, bank, storageScope, allowUnordered]);
  const { progress, round, error } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const items = useMemo(() => round?.ids.map(id => bank.find(i => i.id === id)!).filter(Boolean) ?? [], [round, bank]);
  const status = store.status();
  if (!round) {
    status.word.total = ROUND_SIZE.word;
    status.sentence.total = ROUND_SIZE.sentence;
  }
  return { ready: Boolean(round), progress, status, error, record: store.record, items, bank, start: store.start, replace: store.replace, canReplace: store.canReplace };
}
export type StageTraining = ReturnType<typeof useStageTraining>;
