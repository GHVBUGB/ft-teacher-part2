/** Public API types are generated from the FastAPI OpenAPI contract. */
import type { components } from './generated';
type Schema = components['schemas'];
export type Teacher = Schema['Teacher'];
export type Enrollment = Schema['Enrollment'];
export type PartProgress = Schema['PartProgress'];
export type ProgressResponse = Schema['ProgressResponse'];
export type CourseResponse = Schema['CourseResponse'];
export type ApiErrorBody = Schema['ErrorEnvelope'];
export type PartKey = PartProgress['part_key'];
export type CompletionState = PartProgress['completion_state'];
export type AssessmentState = PartProgress['assessment_state'];
export type ApiSuccess<T> = { data: T; request_id: string };
