import fixture from '../../../contracts/mock.json';
import type {
  ApiSuccess,
  ApiErrorBody,
  Teacher,
  Enrollment,
  ProgressResponse,
  CourseResponse,
} from './contracts';
export const DEMO_ENROLLMENT_ID = fixture.enrollment.id;
export const MOCK_MODE = !import.meta.env.VITE_API_BASE_URL;
export class ApiError extends Error {
  constructor(
    public detail: ApiErrorBody,
    public status: number,
  ) {
    super(detail.error.message);
  }
}
export async function request<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (MOCK_MODE) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 80);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });
    const resources: Record<string, unknown> = {
      '/me': fixture.teacher,
      '/enrollments': [fixture.enrollment],
      [`/enrollments/${DEMO_ENROLLMENT_ID}/progress`]: fixture.progress,
      [`/enrollments/${DEMO_ENROLLMENT_ID}/course`]: fixture.course,
    };
    if (!(path in resources))
      throw new ApiError(
        {
          error: {
            code: 'NOT_FOUND',
            message:
              'This training assignment is not available in the mock data.',
            retryable: false,
          },
          request_id: crypto.randomUUID(),
        },
        404,
      );
    const envelope: ApiSuccess<unknown> = {
      data: structuredClone(resources[path]),
      request_id: crypto.randomUUID(),
    };
    return envelope.data as T;
  }
  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/api/v1${path}`,
    { credentials: 'include', signal, headers: { Accept: 'application/json' } },
  );
  const body = await response.json();
  if (!response.ok) throw new ApiError(body as ApiErrorBody, response.status);
  return (body as ApiSuccess<T>).data;
}
export const api = {
  me: (signal?: AbortSignal) => request<Teacher>('/me', signal),
  enrollments: (signal?: AbortSignal) =>
    request<Enrollment[]>('/enrollments', signal),
  progress: (id: string, signal?: AbortSignal) =>
    request<ProgressResponse>(`/enrollments/${id}/progress`, signal),
  course: (id: string, signal?: AbortSignal) =>
    request<CourseResponse>(`/enrollments/${id}/course`, signal),
};
export const queryKeys = {
  me: ['me'] as const,
  progress: (id: string) => ['enrollments', id, 'progress'] as const,
  course: (id: string) => ['enrollments', id, 'course'] as const,
};
