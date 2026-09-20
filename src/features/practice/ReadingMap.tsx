import type { StageTraining } from './useStageTraining';
import WordAtlas from './WordAtlas';
import SentenceAtlas from './SentenceAtlas';

type ReadingMapProps = {
  stage: StageTraining;
  kind: 'word' | 'sentence';
  onSelect: (id: string) => void;
  onSwitchStage: (kind: 'word' | 'sentence') => void;
};

/** Both maps derive their cards and progress from the existing stage records. */
export default function ReadingMap(props: ReadingMapProps) {
  const Atlas = props.kind === 'word' ? WordAtlas : SentenceAtlas;
  return <Atlas stage={props.stage} onSelect={props.onSelect} onSwitchStage={props.onSwitchStage} />;
}
