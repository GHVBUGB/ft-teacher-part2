// Bound every asynchronous stage, including browser decoding and injected assessors.
export const ASSESSMENT_TIMEOUT_MS = 75_000;
export function abortable<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => { signal.throwIfAborted(); return work(); })
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}
