import { createContext, useContext, type ReactNode } from 'react';
import type {
  Teacher,
  CourseResponse,
  ProgressResponse,
} from '../api/contracts';
export type TrainingContextValue = {
  teacher: Teacher;
  enrollment_id: string;
  course: CourseResponse;
  progress: ProgressResponse;
};
const TrainingContext = createContext<TrainingContextValue | null>(null);
export const TrainingProvider = ({
  value,
  children,
}: {
  value: TrainingContextValue;
  children: ReactNode;
}) => (
  <TrainingContext.Provider value={value}>{children}</TrainingContext.Provider>
);
export function useTraining() {
  const value = useContext(TrainingContext);
  if (!value) throw new Error('Practice must be mounted inside TrainingShell');
  return value;
}
