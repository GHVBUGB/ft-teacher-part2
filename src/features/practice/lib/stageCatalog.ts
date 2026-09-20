import { words } from './catalog';
import type { StageItem } from './stageProgress';

export const stageItems: readonly StageItem[] = words.map((item) => ({
  id: item.id,
  text: item.text,
  kind: item.kind === '关键词' ? 'word' : 'sentence',
}));
